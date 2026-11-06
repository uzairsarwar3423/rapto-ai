"""
api/internal_auth.py
────────────────────
Verification of the BFF-signed SERVICE JWT that authenticates every /chat call.

Controls (plan §2 #9):
  * asymmetric algorithms ONLY, pinned in config — `none`, HS* and algorithm-confusion
    (HS256 signed with the public key) are refused before any key is touched
  * `kid` selects from a key SET, so a rotation needs no downtime (two kids live at once)
  * issuer + audience are required and checked
  * `exp` and `iat` required; lifetime (exp - iat) capped (default 60 s) and small leeway
  * identity claims (team/user/role/plan/tz) are required and format-checked;
    claims are the ONLY source of identity — never the request body
  * every failure is one generic 401 (no oracle about which check failed; the reason
    goes to a metric label and a DEBUG-free structured log)
The service is reachable only on the private network (see runbook_chat.md).
"""

from __future__ import annotations

from typing import Any, Optional

import jwt
import pytz
import structlog
from fastapi import Header, Request

from src.config.chat_config import ChatSettings, get_chat_settings
from src.models.chat_models import ChatClaims
from src.rag.metrics import metrics
from src.services.chat.errors import UnauthenticatedError

log = structlog.get_logger(__name__)

_REQUIRED = ("exp", "iat", "iss", "aud", "team_id", "user_id", "role", "plan", "tz")


class InternalJWTVerifier:
    def __init__(self, settings: ChatSettings, *, key_set: Optional[dict[str, str]] = None) -> None:
        self._algs = settings.jwt_algorithms
        self._issuer = settings.internal_jwt_issuer
        self._audience = settings.internal_jwt_audience
        self._leeway = settings.internal_jwt_leeway_s
        self._max_lifetime = settings.internal_jwt_max_lifetime_s
        self._keys: dict[str, Any] = {}
        for kid, pem in (key_set if key_set is not None else settings.jwt_key_set()).items():
            self._keys[kid] = jwt.PyJWK.from_dict(_load_jwk(pem)) if pem.lstrip().startswith("{") else pem

    @property
    def key_ids(self) -> list[str]:
        return sorted(self._keys)

    def _fail(self, reason: str) -> UnauthenticatedError:
        metrics.inc("chat_auth_failures_total", reason=reason)
        log.warning("chat_auth_failed", reason=reason)
        return UnauthenticatedError()

    def verify(self, token: str) -> ChatClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise self._fail("malformed") from None
        alg = header.get("alg")
        if alg not in self._algs:                       # blocks `none`, HS*, and alg confusion up front
            raise self._fail("alg_not_allowed")
        kid = header.get("kid")
        if not isinstance(kid, str) or kid not in self._keys:
            raise self._fail("unknown_kid")
        key = self._keys[kid]
        try:
            payload = jwt.decode(
                token, key=key.key if isinstance(key, jwt.PyJWK) else key, algorithms=[alg],
                audience=self._audience, issuer=self._issuer, leeway=self._leeway,
                options={"require": list(_REQUIRED[:5]), "verify_signature": True},
            )
        except jwt.ExpiredSignatureError:
            raise self._fail("expired") from None
        except jwt.InvalidAudienceError:
            raise self._fail("bad_audience") from None
        except jwt.InvalidIssuerError:
            raise self._fail("bad_issuer") from None
        except jwt.PyJWTError:
            raise self._fail("invalid") from None

        try:
            lifetime = int(payload["exp"]) - int(payload["iat"])
        except (TypeError, ValueError):
            raise self._fail("bad_times") from None
        if lifetime <= 0 or lifetime > self._max_lifetime + self._leeway:
            raise self._fail("lifetime_too_long")

        return self._claims_from_payload(payload)

    def claims_without_verification(self, token: str) -> ChatClaims:
        """INSECURE (CHAT_AUTH_DISABLED): read the identity claims WITHOUT checking signature, kid, issuer, audience or
        expiry. The identity claims are still required and format-checked. Never used unless the flag is set."""
        try:
            payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": False, "verify_aud": False,
                                                 "verify_iss": False, "verify_iat": False, "verify_nbf": False})
        except jwt.PyJWTError:
            raise self._fail("malformed") from None
        return self._claims_from_payload(payload)

    def _claims_from_payload(self, payload: dict[str, Any]) -> ChatClaims:
        missing = [c for c in _REQUIRED[4:] if not payload.get(c)]      # team_id too: the unverified path has no `require`
        if missing:
            raise self._fail("missing_claims")
        tz = str(payload["tz"])
        try:
            pytz.timezone(tz)
        except pytz.UnknownTimeZoneError:
            raise self._fail("bad_tz") from None
        try:
            return ChatClaims(
                team_id=str(payload["team_id"]), user_id=str(payload["user_id"]),
                role=str(payload["role"]), plan=str(payload["plan"]).upper(), tz=tz,
                request_id=str(payload["rid"]) if payload.get("rid") else None,
            )
        except ValueError:                              # malformed team_id / user_id
            raise self._fail("bad_claims") from None


def _load_jwk(raw: str) -> dict[str, Any]:
    import json
    return json.loads(raw)


# ─── FastAPI dependency ───────────────────────────────────────────────────────

_verifier: Optional[InternalJWTVerifier] = None


def get_verifier(request: Request) -> InternalJWTVerifier:
    verifier = getattr(request.app.state, "chat_jwt_verifier", None)
    if verifier is None:
        global _verifier
        if _verifier is None:
            _verifier = InternalJWTVerifier(get_chat_settings())
        verifier = _verifier
    return verifier  # type: ignore[no-any-return]


def authenticate(request: Request, authorization: Optional[str] = Header(default=None)) -> ChatClaims:
    """FastAPI dependency: Bearer token → verified claims, or one generic 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthenticatedError()
    token = authorization[7:].strip()
    verifier = get_verifier(request)
    if get_chat_settings().chat_auth_disabled:      # TEMPORARY, INSECURE: see ChatSettings.chat_auth_disabled
        return verifier.claims_without_verification(token)
    return verifier.verify(token)
