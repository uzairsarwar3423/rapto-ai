"""
rag/hashing.py — pure, no I/O.

content_hash is a CHANGE-DETECTION and EMBEDDING-COST cache key (ADR-4), not a
row identity. It hashes exactly what the model embeds, plus the model name, so
a model upgrade invalidates every cached vector automatically.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

from src.config.rag_config import EMBEDDING_MODEL, HASH_NORMALIZATION_VERSION

_WS = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """NFC → strip → collapse whitespace runs. Case is deliberately preserved:
    embeddings are case-sensitive and the hash must reflect what was embedded."""
    return _WS.sub(" ", unicodedata.normalize("NFC", text).strip())


def compute_content_hash(text: str, model_name: str = EMBEDDING_MODEL) -> str:
    payload = f"v{HASH_NORMALIZATION_VERSION}|{model_name}|{normalize_text(text)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
