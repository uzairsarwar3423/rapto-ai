"""
api/routes/chat.py
──────────────────
/chat/*  — authenticated by the BFF-signed service JWT (api/internal_auth.py). Identity comes ONLY from the verified
claims. Every data access goes through a per-request, (team,user)-scoped repository, so a foreign session id is a 404.

POST /chat/query is PREFLIGHT (real HTTP status codes) + STREAM (SSE, status 200). See docs/chat/sse_protocol_v1.md.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Optional

import structlog
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from src.api.internal_auth import authenticate
from src.api.sse import SSEStream, sse_response
from src.models.chat_models import (
    ChatClaims, ChatRequest, FeedbackRequest, MessageList, MessageOut, RenameRequest, SessionList, SessionOut,
    SourceItem, SuggestionList,
)
from src.services.chat.access_scope import resolve_access_scope
from src.services.chat.errors import ChatError, FeatureDisabledError, NotFoundError

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
Claims = Annotated[ChatClaims, Depends(authenticate)]


def _rt(request: Request) -> Any:
    rt = getattr(request.app.state, "chat", None)
    if rt is None:
        raise FeatureDisabledError(retry_after_s=60)
    return rt


def _id(value: str) -> str:
    if not _ID.match(value):
        raise NotFoundError()                      # malformed ids are indistinguishable from unknown ones
    return value


async def chat_error_handler(request: Request, exc: ChatError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=exc.to_body(), headers=exc.headers())


# ─── query (SSE) ──────────────────────────────────────────────────────────────

@router.post("/query")
async def query(body: ChatRequest, request: Request, claims: Claims) -> Any:
    rt = _rt(request)
    prepared = await rt.service.prepare(claims, body)                  # ChatError → real HTTP status via the handler
    stream = SSEStream(prepared.ctx, rt.service.producer(prepared), rt.settings, is_disconnected=request.is_disconnected)
    stream.start()                                                      # the producer owns cleanup from here on
    return sse_response(stream)


# ─── sessions ─────────────────────────────────────────────────────────────────

def _session_out(s: dict[str, Any]) -> SessionOut:
    return SessionOut(id=s["_id"], title=s.get("title", ""), message_count=int(s.get("message_count", 0)),
                      created_at=s["created_at"], updated_at=s["updated_at"])


@router.get("/sessions", response_model=SessionList)
async def list_sessions(request: Request, claims: Claims, limit: int = Query(20, ge=1, le=50),
                        cursor: Optional[str] = Query(None, max_length=512)) -> SessionList:
    rt = _rt(request)
    rows, nxt = await rt.repo_factory(claims.team_id, claims.user_id).list_sessions(limit, cursor)
    return SessionList(items=[_session_out(r) for r in rows], next_cursor=nxt)


def _message_out(m: dict[str, Any]) -> MessageOut:
    sources = []
    for ref in m.get("source_refs") or []:
        try:
            sources.append(SourceItem.model_validate({k: v for k, v in ref.items() if k in SourceItem.model_fields}))
        except ValueError:
            continue
    return MessageOut(id=m["_id"], role=m["role"], content=m.get("content", ""), status=m.get("status", ""),
                      finish_reason=m.get("finish_reason"), intent=m.get("intent"), sources=sources,
                      created_at=m["created_at"], reply_to=m.get("reply_to"), feedback=m.get("feedback"))


@router.get("/sessions/{session_id}/messages", response_model=MessageList)
async def list_messages(session_id: str, request: Request, claims: Claims, limit: int = Query(30, ge=1, le=50),
                        cursor: Optional[str] = Query(None, max_length=512)) -> MessageList:
    rt = _rt(request)
    scope = await resolve_access_scope(rt.store, rt.settings, claims.team_id, claims.user_id)

    async def visible(ids: list[str]) -> set[str]:                     # ADR-8: access is re-checked on every history read
        return await rt.store.visible_meetings(claims.team_id, ids, scope)

    rows, nxt = await rt.repo_factory(claims.team_id, claims.user_id).list_messages(_id(session_id), limit, cursor, visible=visible)
    return MessageList(items=[_message_out(r) for r in rows], next_cursor=nxt)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def rename_session(session_id: str, body: RenameRequest, request: Request, claims: Claims) -> SessionOut:
    repo = _rt(request).repo_factory(claims.team_id, claims.user_id)
    await repo.rename_session(_id(session_id), body.title)
    return _session_out(await repo.get_session(session_id))


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, request: Request, claims: Claims) -> Response:
    await _rt(request).repo_factory(claims.team_id, claims.user_id).soft_delete_session(_id(session_id))
    return Response(status_code=204)


@router.post("/messages/{message_id}/feedback", status_code=204)
async def feedback(message_id: str, body: FeedbackRequest, request: Request, claims: Claims) -> Response:
    await _rt(request).repo_factory(claims.team_id, claims.user_id).upsert_feedback(_id(message_id), body.rating, body.reason, body.comment)
    return Response(status_code=204)


@router.get("/suggestions", response_model=SuggestionList)
async def suggestions(request: Request, claims: Claims) -> SuggestionList:
    rt = _rt(request)
    if not rt.settings.is_enabled_for(claims.team_id):
        raise FeatureDisabledError(retry_after_s=60)
    import pytz
    from datetime import datetime, timezone
    now_local = datetime.now(timezone.utc).astimezone(pytz.timezone(claims.tz))
    scope = await resolve_access_scope(rt.store, rt.settings, claims.team_id, claims.user_id)
    items = await rt.suggestions.get(team_id=claims.team_id, user_id=claims.user_id, tz=claims.tz, today=now_local.date(), scope=scope)
    return SuggestionList(items=items)
