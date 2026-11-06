"""
services/chat/prompt_text.py
────────────────────────────
Prompt-injection hygiene primitives shared by the rewriter, context builder and memory.

The original spec's "escape `</source`" claim is false: case variants, look-alike Unicode brackets and
whitespace tricks forge closers, and meeting titles / speaker names went into tag ATTRIBUTES unescaped.
The scheme here:

  1. NFKC-normalize (folds full-width/look-alike brackets such as '＜' '﹤' to '<'), strip control/bidi,
  2. escape &, <, > and quotes in EVERY attribute and body (so a forged closer is inert text), and
  3. use a per-request random NONCE in the tag name, which no transcript author can guess in advance.

Defense in depth: even a perfectly escaped body is still framed as DATA by the system prompt.
"""

from __future__ import annotations

import re
import secrets
import unicodedata

from src.services.chat.input_sanitizer import strip_hidden

# Marker-looking text inside sources would confuse [S#] bookkeeping: [S1] / [S1, S3] / [S1][S2]
_MARKER_LIKE = re.compile(r"\[\s*S\s*\d+(?:\s*[,;]\s*S?\s*\d+)*\s*\]", re.IGNORECASE)
_NONCE_LEN = 6


def new_nonce() -> str:
    return secrets.token_hex(_NONCE_LEN)


def normalize(text: str) -> str:
    """NFKC + strip hidden characters. NFKC is what makes look-alike brackets collapse to real ones."""
    return strip_hidden(unicodedata.normalize("NFKC", text))


def escape(text: str) -> str:
    """Make `text` inert inside an XML-ish prompt block (body or attribute value)."""
    t = normalize(text)
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#39;"))


def neutralize_markers(text: str) -> str:
    """Replace citation-looking markers in UNTRUSTED text with parentheses so only real ids carry meaning."""
    return _MARKER_LIKE.sub(lambda m: "(" + m.group(0)[1:-1] + ")", text)


def attr(value: object) -> str:
    return escape("" if value is None else str(value)).replace("\n", " ")[:200]


def block(tag: str, nonce: str, body: str, **attrs: object) -> str:
    """<tag_nonce a="b">escaped body</tag_nonce> — the only way blocks are produced."""
    attr_s = "".join(f' {k}="{attr(v)}"' for k, v in attrs.items() if v is not None)
    return f"<{tag}_{nonce}{attr_s}>\n{escape(neutralize_markers(body))}\n</{tag}_{nonce}>"


_CITATION = re.compile(r"\s*\[\s*S\s*\d+(?:\s*[,;]\s*S?\s*\d+)*\s*\]", re.IGNORECASE)
_PAREN_CITATION = re.compile(r"\s*\(\s*S\s*\d+(?:\s*[,;]\s*S?\s*\d+)*\s*\)", re.IGNORECASE)


def strip_citation_markers(text: str) -> str:
    """History hygiene: a prior turn's [S2] is a DIFFERENT source in this turn, so markers are removed."""
    return _PAREN_CITATION.sub("", _CITATION.sub("", text)).strip()
