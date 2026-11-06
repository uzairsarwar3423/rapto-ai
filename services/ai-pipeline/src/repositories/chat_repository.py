"""
repositories/chat_repository.py
───────────────────────────────
Chat persistence (Mongo). Mongo has NO row-level security, so tenancy is enforced HERE and
nowhere else:

  * `ScopedCollection` is the only thing that touches a collection. It INJECTS `team_id`
    (+ `user_id`) into every filter and every inserted document, and REFUSES a caller that
    supplies either key itself — one forgotten filter cannot become a cross-tenant leak.
  * Repositories are constructed per request for (team, user). Foreign sessions/messages are
    indistinguishable from nonexistent ones (NotFoundError → 404, never 403).
  * Compound indexes lead with team_id.
  * `SystemMaintenance` (retention purge) and `TeamAdmin` (meeting-deletion / GDPR hooks) are the only
    classes that are not user-scoped; they are named, narrow, and listed in the guard test.

IDEMPOTENCY (plan §4.4) lives on the USER message of a (team, user, client_message_id):
  accepted(+live lease) → IN_FLIGHT · answered → COMPLETED (free replay) ·
  failed/cancelled/expired-lease → RERUN (atomic takeover; exactly one racer wins).
The id is stored only on user messages, so the unique key never collides with an assistant message.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Literal, Optional, Sequence

import structlog
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from src.models.chat_models import FinishReason, MessageStatus
from src.rag.metrics import metrics
from src.services.chat.errors import InvalidInputError, NotFoundError

log = structlog.get_logger(__name__)

SESSIONS, MESSAGES, FEEDBACK = "chat_sessions", "chat_messages", "chat_feedback"
_TENANCY_KEYS = ("team_id", "user_id")
MAX_PAGE = 50


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Mongo drivers return naive-UTC datetimes by default; normalize everything to aware UTC."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


# ─── scoped collection ────────────────────────────────────────────────────────

class ScopedCollection:
    def __init__(self, collection: Any, team_id: str, user_id: Optional[str] = None) -> None:
        if not team_id:
            raise ValueError("team_id is required")
        self._c = collection
        self.team_id = team_id
        self.user_id = user_id

    def _scope(self) -> dict[str, str]:
        s = {"team_id": self.team_id}
        if self.user_id is not None:
            s["user_id"] = self.user_id
        return s

    def _f(self, flt: Optional[dict[str, Any]]) -> dict[str, Any]:
        flt = dict(flt or {})
        if any(k in flt for k in _TENANCY_KEYS):
            raise ValueError("callers must not supply team_id/user_id; ScopedCollection injects them")
        return {**flt, **self._scope()}

    async def find_one(self, flt: Optional[dict[str, Any]] = None, **kw: Any) -> Optional[dict[str, Any]]:
        return await self._c.find_one(self._f(flt), **kw)  # type: ignore[no-any-return]

    def find(self, flt: Optional[dict[str, Any]] = None, **kw: Any) -> Any:
        return self._c.find(self._f(flt), **kw)

    async def insert_one(self, doc: dict[str, Any]) -> Any:
        if any(k in doc for k in _TENANCY_KEYS):
            raise ValueError("documents must not carry team_id/user_id; ScopedCollection injects them")
        return await self._c.insert_one({**doc, **self._scope()})

    async def update_one(self, flt: dict[str, Any], update: dict[str, Any], **kw: Any) -> Any:
        if kw.get("upsert"):
            update = {**update, "$setOnInsert": {**update.get("$setOnInsert", {}), **self._scope()}}
        return await self._c.update_one(self._f(flt), update, **kw)

    async def find_one_and_update(self, flt: dict[str, Any], update: dict[str, Any], **kw: Any) -> Optional[dict[str, Any]]:
        return await self._c.find_one_and_update(self._f(flt), update, **kw)  # type: ignore[no-any-return]

    async def delete_many(self, flt: dict[str, Any]) -> int:
        res = await self._c.delete_many(self._f(flt))
        return int(res.deleted_count)

    async def count_documents(self, flt: Optional[dict[str, Any]] = None) -> int:
        return int(await self._c.count_documents(self._f(flt)))


# ─── cursors ──────────────────────────────────────────────────────────────────

class CursorCodec:
    """Opaque, tamper-evident pagination cursors (HMAC-SHA256)."""

    def __init__(self, secret: str) -> None:
        if not secret:
            raise ValueError("cursor secret must not be empty")
        self._key = secret.encode()

    def encode(self, payload: dict[str, Any]) -> str:
        body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
        sig = base64.urlsafe_b64encode(hmac.new(self._key, body, hashlib.sha256).digest()[:16]).rstrip(b"=")
        return f"{body.decode()}.{sig.decode()}"

    def decode(self, token: str) -> dict[str, Any]:
        try:
            body, sig = token.split(".", 1)
            expect = base64.urlsafe_b64encode(hmac.new(self._key, body.encode(), hashlib.sha256).digest()[:16]).rstrip(b"=")
            if not hmac.compare_digest(sig.encode(), expect):
                raise ValueError("bad signature")
            pad = "=" * (-len(body) % 4)
            data = json.loads(base64.urlsafe_b64decode(body + pad))
            if not isinstance(data, dict):
                raise ValueError("bad payload")
            return data
        except Exception:  # noqa: BLE001
            raise InvalidInputError("invalid cursor", field="cursor") from None


# ─── results ──────────────────────────────────────────────────────────────────

AcceptState = Literal["new", "in_flight", "completed", "rerun"]


@dataclass
class AcceptResult:
    state: AcceptState
    session_id: str
    user_message_id: str
    active_request_id: Optional[str] = None
    assistant: Optional[dict[str, Any]] = None
    session_created: bool = False


@dataclass
class FinalizeInput:
    user_message_id: str
    assistant_id: str
    run_id: str
    content: str
    status: str                                  # "answered" | "cancelled" | "error" (assistant doc status)
    finish_reason: str
    intent: Optional[str] = None
    rewritten_query: Optional[str] = None
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    citations: dict[str, Any] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)
    prompt_versions: dict[str, str] = field(default_factory=dict)
    rerank_summary: dict[str, Any] = field(default_factory=dict)
    latency: dict[str, float] = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)
    degraded: bool = False


VisibilityCheck = Callable[[list[str]], Awaitable[set[str]]]
_REPLAYABLE = (FinishReason.STOP.value, FinishReason.NO_RESULTS.value, FinishReason.LENGTH.value, FinishReason.FILTERED.value)


# ─── user-scoped repository ───────────────────────────────────────────────────

class ChatRepository:
    def __init__(self, db: Any, team_id: str, user_id: str, *, cursors: CursorCodec, title_max_chars: int = 60,
                 lease_s: float = 75.0, clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> None:
        self.sessions = ScopedCollection(db[SESSIONS], team_id, user_id)
        self.messages = ScopedCollection(db[MESSAGES], team_id, user_id)
        self.feedback = ScopedCollection(db[FEEDBACK], team_id, user_id)
        self.team_id, self.user_id = team_id, user_id
        self._cursors = cursors
        self._title_max = title_max_chars
        self._lease_s = lease_s
        self._clock = clock

    def _now(self) -> datetime:
        return self._clock()

    # ── sessions ─────────────────────────────────────────────────────────────

    async def get_session(self, session_id: str) -> dict[str, Any]:
        s = await self.sessions.find_one({"_id": session_id, "deleted_at": None})
        if s is None:
            raise NotFoundError()
        return s

    async def _ensure_session(self, session_id: Optional[str], first_text: str, now: datetime) -> tuple[str, bool]:
        if session_id:
            await self.get_session(session_id)                    # 404 for foreign / deleted / nonexistent
            return session_id, False
        sid = str(uuid.uuid4())
        title = first_text.strip().replace("\n", " ")[: self._title_max] or "New conversation"
        await self.sessions.insert_one({
            "_id": sid, "title": title, "summary": "", "summary_upto_msg_id": None, "message_count": 0,
            "created_at": now, "updated_at": now, "deleted_at": None,
        })
        return sid, True

    async def list_sessions(self, limit: int = 20, cursor: Optional[str] = None) -> tuple[list[dict[str, Any]], Optional[str]]:
        limit = max(1, min(int(limit), MAX_PAGE))
        flt: dict[str, Any] = {"deleted_at": None, "message_count": {"$gt": 0}}
        if cursor:
            c = self._cursors.decode(cursor)
            ts, cid = datetime.fromisoformat(c["t"]), c["i"]
            flt["$or"] = [{"updated_at": {"$lt": ts}}, {"updated_at": ts, "_id": {"$lt": cid}}]
        rows = await self.sessions.find(flt).sort([("updated_at", -1), ("_id", -1)]).limit(limit + 1).to_list(limit + 1)
        more = len(rows) > limit
        rows = rows[:limit]
        nxt = None
        if more and rows:
            last = rows[-1]
            nxt = self._cursors.encode({"t": _utc(last["updated_at"]).isoformat(), "i": last["_id"]})
        return rows, nxt

    async def rename_session(self, session_id: str, title: str) -> None:
        title = title.strip()
        if not title or len(title) > 120:
            raise InvalidInputError("title must be 1-120 characters", field="title")
        res = await self.sessions.update_one({"_id": session_id, "deleted_at": None},
                                             {"$set": {"title": title, "updated_at": self._now()}})
        if res.matched_count == 0:
            raise NotFoundError()

    async def soft_delete_session(self, session_id: str) -> None:
        """Idempotent: deleting an already-deleted session is a no-op, an unknown one is 404."""
        existing = await self.sessions.find_one({"_id": session_id})
        if existing is None:
            raise NotFoundError()
        if existing.get("deleted_at") is None:
            await self.sessions.update_one({"_id": session_id}, {"$set": {"deleted_at": self._now()}})

    # ── idempotent accept ────────────────────────────────────────────────────

    async def accept_user_message(self, *, session_id: Optional[str], text: str, client_message_id: str,
                                  request_id: str) -> AcceptResult:
        now = self._now()
        now_ts = now.timestamp()
        existing = await self.messages.find_one({"role": "user", "client_message_id": client_message_id})
        if existing is None:
            sid, created = await self._ensure_session(session_id, text, now)
            uid = str(uuid.uuid4())
            try:
                await self.messages.insert_one({
                    "_id": uid, "session_id": sid, "role": "user", "content": text, "status": MessageStatus.ACCEPTED.value,
                    "client_message_id": client_message_id, "request_id": request_id,
                    "lease_expires_at": now_ts + self._lease_s, "created_at": now,
                })
            except DuplicateKeyError:                              # lost a race with a concurrent retry
                existing = await self.messages.find_one({"role": "user", "client_message_id": client_message_id})
                if existing is None:                                # pragma: no cover — defensive
                    raise
            else:
                await self.sessions.update_one({"_id": sid}, {"$inc": {"message_count": 1}, "$set": {"updated_at": now}})
                return AcceptResult("new", sid, uid, session_created=created)

        if session_id and existing["session_id"] != session_id:
            raise InvalidInputError("client_message_id was already used in another conversation", field="client_message_id")
        sid, uid = existing["session_id"], existing["_id"]
        status = existing["status"]

        if status == MessageStatus.ANSWERED.value:
            assistant = await self.get_completed_assistant(uid)
            if assistant is not None:
                return AcceptResult("completed", sid, uid, assistant=assistant)
            status = MessageStatus.FAILED.value                    # answered but the reply is gone → run again

        if status == MessageStatus.ACCEPTED.value and float(existing.get("lease_expires_at", 0)) > now_ts:
            return AcceptResult("in_flight", sid, uid, active_request_id=existing.get("request_id"))

        won = await self.messages.find_one_and_update(
            {"_id": uid, "role": "user", "$or": [
                {"status": {"$in": [MessageStatus.FAILED.value, MessageStatus.CANCELLED.value, MessageStatus.ANSWERED.value]}},
                {"status": MessageStatus.ACCEPTED.value, "lease_expires_at": {"$lte": now_ts}},
            ]},
            {"$set": {"status": MessageStatus.ACCEPTED.value, "request_id": request_id,
                      "lease_expires_at": now_ts + self._lease_s}},
            return_document=ReturnDocument.AFTER,
        )
        if won is None:                                             # another retry took it first
            fresh = await self.messages.find_one({"_id": uid})
            return AcceptResult("in_flight", sid, uid, active_request_id=(fresh or {}).get("request_id"))
        metrics.inc("chat_rerun_total")
        return AcceptResult("rerun", sid, uid)

    async def get_completed_assistant(self, user_message_id: str) -> Optional[dict[str, Any]]:
        rows = await self.messages.find(
            {"role": "assistant", "reply_to": user_message_id, "finish_reason": {"$in": list(_REPLAYABLE)}}
        ).sort([("created_at", -1)]).limit(1).to_list(1)
        return rows[0] if rows else None

    async def mark_user_message(self, user_message_id: str, status: MessageStatus, request_id: str) -> bool:
        """Only the run that owns the lease may change the status (a late finalizer must not clobber a rerun)."""
        res = await self.messages.update_one(
            {"_id": user_message_id, "role": "user", "request_id": request_id},
            {"$set": {"status": status.value, "lease_expires_at": 0.0}})
        return bool(res.matched_count)

    # ── assistant message ────────────────────────────────────────────────────

    async def finalize_assistant_message(self, f: FinalizeInput, session_id: str) -> bool:
        """Idempotent by (reply_to, run_id). Returns True when this call inserted the message."""
        now = self._now()
        res = await self.messages.update_one(
            {"role": "assistant", "reply_to": f.user_message_id, "run_id": f.run_id},
            {"$set": {
                "content": f.content, "status": f.status, "finish_reason": f.finish_reason, "intent": f.intent,
                "rewritten_query": f.rewritten_query, "source_refs": f.source_refs, "citations": f.citations,
                "usage": f.usage, "prompt_versions": f.prompt_versions, "rerank_summary": f.rerank_summary,
                "latency": f.latency, "flags": f.flags, "degraded": f.degraded,
            }, "$setOnInsert": {"_id": f.assistant_id, "session_id": session_id, "created_at": now}},
            upsert=True,
        )
        inserted = res.upserted_id is not None
        if inserted:
            await self.sessions.update_one({"_id": session_id}, {"$inc": {"message_count": 1}, "$set": {"updated_at": now}})
        return inserted

    # ── history ──────────────────────────────────────────────────────────────

    async def list_messages(self, session_id: str, limit: int = 30, cursor: Optional[str] = None,
                            visible: Optional[VisibilityCheck] = None) -> tuple[list[dict[str, Any]], Optional[str]]:
        """Newest page first by cursor; items within a page are CHRONOLOGICAL. `next_cursor` pages toward OLDER."""
        await self.get_session(session_id)
        limit = max(1, min(int(limit), MAX_PAGE))
        flt: dict[str, Any] = {"session_id": session_id}
        if cursor:
            c = self._cursors.decode(cursor)
            ts, mid = datetime.fromisoformat(c["t"]), c["i"]
            flt["$or"] = [{"created_at": {"$lt": ts}}, {"created_at": ts, "_id": {"$lt": mid}}]
        rows = await self.messages.find(flt).sort([("created_at", -1), ("_id", -1)]).limit(limit + 1).to_list(limit + 1)
        more = len(rows) > limit
        rows = rows[:limit]
        nxt = None
        if more and rows:
            oldest = rows[-1]
            nxt = self._cursors.encode({"t": _utc(oldest["created_at"]).isoformat(), "i": oldest["_id"]})
        rows.reverse()
        if visible is not None:
            await self._redact(rows, visible)
        await self._attach_feedback(rows)
        return rows, nxt

    async def _redact(self, rows: list[dict[str, Any]], visible: VisibilityCheck) -> None:
        """ADR-8: references + preview are stored, access is RE-CHECKED on every read."""
        ids = sorted({r["meeting_id"] for m in rows for r in (m.get("source_refs") or []) if r.get("meeting_id")})
        if not ids:
            return
        allowed = await visible(ids)
        for m in rows:
            for ref in m.get("source_refs") or []:
                mid = ref.get("meeting_id")
                if mid and mid not in allowed:
                    ref["preview"] = ""
                    ref["meeting_title"] = None
                    ref["redacted"] = True
                    metrics.inc("chat_history_redactions_total")

    async def _attach_feedback(self, rows: list[dict[str, Any]]) -> None:
        ids = [m["_id"] for m in rows if m["role"] == "assistant"]
        if not ids:
            return
        fb = {f["message_id"]: f["rating"] async for f in self.feedback.find({"message_id": {"$in": ids}})}
        for m in rows:
            if m["_id"] in fb:
                m["feedback"] = fb[m["_id"]]

    async def recent_turns(self, session_id: str, *, limit: int, exclude_id: Optional[str] = None,
                           after_id: Optional[str] = None) -> list[dict[str, Any]]:
        """Last `limit` conversational messages (chronological) that are fit to feed back to the model."""
        flt: dict[str, Any] = {"session_id": session_id, "$or": [
            {"role": "user", "status": {"$in": [MessageStatus.ANSWERED.value]}},
            {"role": "assistant", "finish_reason": {"$in": [FinishReason.STOP.value, FinishReason.LENGTH.value,
                                                            FinishReason.NO_RESULTS.value]}},
        ]}
        if exclude_id:
            flt["_id"] = {"$ne": exclude_id}
        if after_id:
            anchor = await self.messages.find_one({"_id": after_id})
            if anchor:
                flt["created_at"] = {"$gt": anchor["created_at"]}
        rows = await self.messages.find(flt).sort([("created_at", -1), ("_id", -1)]).limit(limit).to_list(limit)
        rows.reverse()
        return rows

    async def count_unsummarized(self, session_id: str, after_id: Optional[str]) -> int:
        flt: dict[str, Any] = {"session_id": session_id, "status": {"$ne": MessageStatus.ACCEPTED.value}}
        if after_id:
            anchor = await self.messages.find_one({"_id": after_id})
            if anchor:
                flt["created_at"] = {"$gt": anchor["created_at"]}
        return await self.messages.count_documents(flt)

    async def set_summary_if_watermark(self, session_id: str, *, expected_upto: Optional[str], summary: str,
                                       new_upto: str) -> bool:
        """Compare-and-set so two summarizers can never interleave or create gaps/duplicates."""
        res = await self.sessions.update_one(
            {"_id": session_id, "summary_upto_msg_id": expected_upto},
            {"$set": {"summary": summary, "summary_upto_msg_id": new_upto}})
        return bool(res.matched_count)

    # ── feedback ─────────────────────────────────────────────────────────────

    async def upsert_feedback(self, message_id: str, rating: str, reason: Optional[str], comment: Optional[str]) -> None:
        msg = await self.messages.find_one({"_id": message_id, "role": "assistant"})   # scoped to this user
        if msg is None:
            raise NotFoundError()
        await self.feedback.update_one(
            {"message_id": message_id},
            {"$set": {"rating": rating, "reason": reason, "comment": comment, "updated_at": self._now()},
             "$setOnInsert": {"created_at": self._now()}},
            upsert=True)
        metrics.inc("chat_feedback_total", rating=rating)


# ─── team-scoped admin hooks & system maintenance ─────────────────────────────

class TeamAdmin:
    """Team-scoped (not user-scoped) hooks called from the meeting-deletion / user-anonymization flows."""

    def __init__(self, db: Any, team_id: str) -> None:
        self.messages = ScopedCollection(db[MESSAGES], team_id)
        self.sessions = ScopedCollection(db[SESSIONS], team_id)
        self.feedback = ScopedCollection(db[FEEDBACK], team_id)

    async def redact_meeting_sources(self, meeting_id: str) -> int:
        """A meeting was deleted/anonymized: blank every stored preview that references it."""
        n = 0
        async for m in self.messages.find({"source_refs.meeting_id": meeting_id}):
            refs = m.get("source_refs") or []
            for r in refs:
                if r.get("meeting_id") == meeting_id:
                    r["preview"], r["meeting_title"], r["redacted"] = "", None, True
            await self.messages.update_one({"_id": m["_id"]}, {"$set": {"source_refs": refs}})
            n += 1
        return n

    async def purge_user(self, user_id: str) -> dict[str, int]:
        """Right to erasure: remove a user's chats entirely."""
        flt = {"team_id": self.sessions.team_id, "user_id": user_id}      # team + user both explicit
        return {
            "messages": (await self.messages._c.delete_many(flt)).deleted_count,    # noqa: SLF001
            "feedback": (await self.feedback._c.delete_many(flt)).deleted_count,    # noqa: SLF001
            "sessions": (await self.sessions._c.delete_many(flt)).deleted_count,    # noqa: SLF001
        }


class SystemMaintenance:
    """Cross-tenant retention sweep (a scheduled job, never reachable from a request)."""

    def __init__(self, db: Any) -> None:
        self._s, self._m, self._f = db[SESSIONS], db[MESSAGES], db[FEEDBACK]

    async def purge(self, *, retention_days: int, empty_ttl_hours: int, now: datetime) -> dict[str, int]:
        cutoff = now - timedelta(days=retention_days)
        stale = [d async for d in self._s.find({"deleted_at": {"$ne": None, "$lt": cutoff}}, {"_id": 1, "team_id": 1})]
        stale += [d async for d in self._s.find(
            {"message_count": 0, "deleted_at": None, "created_at": {"$lt": now - timedelta(hours=empty_ttl_hours)}},
            {"_id": 1, "team_id": 1})]
        removed = {"sessions": 0, "messages": 0, "feedback": 0}
        for s in stale:
            msg_ids = [m["_id"] async for m in self._m.find({"team_id": s["team_id"], "session_id": s["_id"]}, {"_id": 1})]
            removed["feedback"] += (await self._f.delete_many({"team_id": s["team_id"], "message_id": {"$in": msg_ids}})).deleted_count
            removed["messages"] += (await self._m.delete_many({"team_id": s["team_id"], "session_id": s["_id"]})).deleted_count
            removed["sessions"] += (await self._s.delete_many({"team_id": s["team_id"], "_id": s["_id"]})).deleted_count
        return removed


# ─── indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db: Any) -> list[str]:
    """Idempotent index creation (no migration framework for Mongo). Returns the index names ensured."""
    names: list[str] = []
    names.append(await db[SESSIONS].create_index(
        [("team_id", 1), ("user_id", 1), ("deleted_at", 1), ("updated_at", -1)], name="ix_sessions_owner_recent"))
    names.append(await db[MESSAGES].create_index(
        [("team_id", 1), ("session_id", 1), ("created_at", 1)], name="ix_messages_session_time"))
    names.append(await db[MESSAGES].create_index(
        [("team_id", 1), ("user_id", 1), ("client_message_id", 1)], name="ux_messages_client_id", unique=True,
        partialFilterExpression={"role": "user", "client_message_id": {"$exists": True}}))
    names.append(await db[MESSAGES].create_index(
        [("team_id", 1), ("user_id", 1), ("reply_to", 1), ("run_id", 1)], name="ix_messages_reply"))
    names.append(await db[FEEDBACK].create_index(
        [("team_id", 1), ("user_id", 1), ("message_id", 1)], name="ux_feedback_message", unique=True))
    return names
