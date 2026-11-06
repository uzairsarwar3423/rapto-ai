"""
services/chat/stream_sanitizer.py
─────────────────────────────────
The STREAMING SCRUBBER (ADR-3). A prompt rule ("no links, no HTML") is not a control: a poisoned transcript can
make the model emit a markdown image or link whose URL carries conversation data (the classic markdown-exfiltration
channel) the moment a UI renders it. Validation after the stream cannot unsend tokens, so scrubbing happens IN the
stream, with a bounded look-ahead.

ALLOWS   plain text, paragraphs, bullets, **bold**/*italic*, and VALID citation markers [S#].
REMOVES  images ![..](..) · links [..](..) (the visible text is kept, the URL goes) · bare URLs (http/https/ftp/www/
         data:/javascript:/mailto:) · HTML tags · markers whose id was not given to the model · the CANARY token ·
         the "(target)" of any "](" sequence, matched bracket or not.
         Multi-marker forms ([S1, S3], [S1][S2], (S1), (S1; S2)) are parsed per id; valid ids are kept and
         normalized to [S1][S3].

SPLICE ATTACKS. Removing a construct can make its neighbours ADJACENT: "<[S9]img src=x onerror=1>" would become the
live tag "<img src=x onerror=1>", "ht[S9]tp://evil" a URL, "<<b>img …>" a tag. Every removal/replacement therefore
leaves a separator (a single space, skipped before closing punctuation) so what was split in the model's output
can never be re-joined by our own deletions. (Found by the fuzz test; pinned by test_splice_attacks.)

HOLD-BACK is per construct and bounded (MAX_HOLDBACK): text is released as soon as it is provably safe. A marker
needs ~1 character of look-ahead (to see whether a "(" follows); a link needs its closing ")" (≤ 120 + 300 chars);
a URL scheme prefix or canary prefix is held only while it is still a prefix of one. Nothing else waits.

INVARIANT: the concatenation of everything `feed()`/`finish()` returned is EXACTLY what the client saw AND what gets
persisted. Mutating the text after streaming would make history disagree with the screen.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

LINK_TEXT_MAX = 120
LINK_URL_MAX = 300
TAG_MAX = 200
MARKER_MAX = 48
MAX_HOLDBACK = LINK_TEXT_MAX + LINK_URL_MAX + 16          # worst case: an unterminated link; typical hold is 0-2 chars

_SCHEMES = ("https://", "http://", "ftp://", "www.", "data:", "javascript:", "mailto:")
_SCHEME_RE = re.compile(r"(?:https?://|ftp://|www\.|data:|javascript:|mailto:)", re.IGNORECASE)
_URL_END = set(" \t\r\n<>\"'`]}")                   # ')' is handled with paren balancing in _url()
_MARKER_INNER = re.compile(r"^\s*S\s*\d+(?:\s*[,;/]\s*S?\s*\d+)*\s*$", re.IGNORECASE)
_PAREN_MARKER = re.compile(r"^\(\s*S\s*\d+(?:\s*[,;/]\s*S?\s*\d+)*\s*\)$", re.IGNORECASE)
_IDS = re.compile(r"\d+")
_TAG_START = re.compile(r"^<(?:[/!?]?[A-Za-z]|!--)")
_NO_SEP_BEFORE = set(".,;:?)")                     # a separator before closing punctuation is just noise
CANARY_MIN_PARTIAL = len("CANARY-") + 4


@dataclass
class ScrubReport:
    valid: list[str] = field(default_factory=list)            # distinct valid ids, in order of first use
    removed: list[str] = field(default_factory=list)          # invalid ids that were stripped
    strips: Counter[str] = field(default_factory=Counter)     # image | link | url | html | marker | canary
    canary_tripped: bool = False
    max_holdback: int = 0


class StreamScrubber:
    def __init__(self, valid_ids: set[str], canary: str = "") -> None:
        self._valid = {v.upper() for v in valid_ids}
        self._canary = canary
        self._pending = ""
        self._last = ""                     # last character released (boundary + separator decisions)
        self._sep = False                   # a removal just happened: separate the next non-space output from it
        self._out: list[str] = []
        self.report = ScrubReport()

    # ── public API ────────────────────────────────────────────────────────────

    @property
    def text(self) -> str:
        """Everything released so far (== what the client received == what is persisted)."""
        return "".join(self._out)

    @property
    def tripped(self) -> bool:
        return self.report.canary_tripped

    def feed(self, delta: str) -> str:
        if self.report.canary_tripped or not delta:
            return ""
        self._pending += delta
        released = self._drain(final=False)
        self.report.max_holdback = max(self.report.max_holdback, len(self._pending))
        return self._emit(released)

    def finish(self) -> str:
        if self.report.canary_tripped:
            return ""
        released = self._drain(final=True)
        return self._emit(released)

    # ── output plumbing ───────────────────────────────────────────────────────

    def _emit(self, s: str) -> str:
        if s:
            self._out.append(s)
            self._last = s[-1]
        return s

    def _prev(self, buf: list[str]) -> str:
        for piece in reversed(buf):
            if piece:
                return piece[-1]
        return self._last

    def _put(self, buf: list[str], text: str) -> None:
        """Append released text, inserting the pending separator if needed."""
        if not text:
            return
        if self._sep:
            self._sep = False
            if not text[0].isspace() and text[0] not in _NO_SEP_BEFORE:
                prev = self._prev(buf)
                if prev and not prev.isspace():
                    buf.append(" ")
        buf.append(text)

    def _removed(self, buf: list[str]) -> None:
        """Something was cut out here. Keep the neighbours from touching."""
        prev = self._prev(buf)
        if prev and not prev.isspace():
            buf.append(" ")
        self._sep = True

    def _trip(self) -> None:
        self.report.canary_tripped = True
        self.report.strips["canary"] += 1
        self._pending = ""

    def _note_marker(self, ids: list[str]) -> str:
        out = []
        for raw in ids:
            sid = f"S{int(raw)}"
            if sid in self._valid:
                if sid not in self.report.valid:
                    self.report.valid.append(sid)
                out.append(f"[{sid}]")
            else:
                self.report.removed.append(sid)
                self.report.strips["marker"] += 1
        return "".join(out)

    def _boundary_before(self, buf: list[str], s: str, i: int) -> bool:
        prev = self._prev(buf) if buf else (s[i - 1] if i > 0 else self._last)
        return not prev.isalnum()               # '_' and '*' DO start a boundary: GFM autolinks `_http://x_` and `**www.x**`

    # ── main loop ─────────────────────────────────────────────────────────────

    def _drain(self, final: bool) -> str:
        s = self._pending
        buf: list[str] = []
        i, n = 0, len(s)
        while i < n:
            ch = s[i]
            if ch == "[" or (ch == "!" and s[i + 1:i + 2] == "["):
                step = self._bracket(s, i, final, buf)
            elif ch == "!" and i + 1 >= n and not final:
                break                                                  # might be the start of an image
            elif ch == "]":
                step = self._close_bracket(s, i, final, buf)
            elif ch == "(":
                step = self._paren(s, i, final, buf)
            elif ch == "<":
                step = self._tag(s, i, final, buf)
            elif ch in "hHwWfFdDjJmM" and self._boundary_before(buf, s, i):
                step = self._url(s, i, final, buf)
            elif self._canary and ch.casefold() == self._canary[0].casefold():
                step = self._canary_check(s, i, final, buf)
            else:
                self._put(buf, ch)
                step = 1
            if step is None:                                           # need more input to decide
                break
            if step < 0 or self.report.canary_tripped:                 # canary tripped (here or inside a bracket)
                self._pending = ""
                return "".join(buf)
            i += step
        self._pending = s[i:]
        return "".join(buf)

    # Each handler returns: chars consumed (>0) | None (need more input) | -1 (tripped)

    def _canary_check(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        c = self._canary.casefold()
        tail = s[i:i + len(c)].casefold()
        if tail == c:
            self._trip()
            return -1
        if c.startswith(tail) and len(tail) < len(c):                 # still a prefix of the canary
            if not final:
                return None
            if len(tail) >= CANARY_MIN_PARTIAL:                       # a stream that ENDS mid-canary leaked half of it
                self._trip()
                return -1
        self._put(buf, s[i])
        return 1

    def _url(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        m = _SCHEME_RE.match(s, i)
        if m:
            j = m.end()
            depth = 0                                                   # javascript:alert(1) must go whole
            while j < len(s) and s[j] not in _URL_END:
                if s[j] == "(":
                    depth += 1
                elif s[j] == ")":
                    if depth == 0:
                        break
                    depth -= 1
                j += 1
            if j >= len(s) and not final:
                return None                                            # URL may continue in the next delta
            self.report.strips["url"] += 1
            self._removed(buf)
            return j - i
        low = s[i:].lower()
        if not final and any(sch.startswith(low) and len(low) < len(sch) for sch in _SCHEMES):
            return None                                                # a proper prefix of a scheme: wait
        self._put(buf, s[i])
        return 1

    def _tag(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        rest = s[i:]
        if rest in ("<", "<!", "<!-", "</", "<?") and not final:
            return None                                                # cannot tell yet whether this opens a tag
        if not _TAG_START.match(rest[:5]):
            self._put(buf, "<")                                        # "a < b": ordinary text
            return 1
        j = s.find(">", i + 1)
        if j == -1:
            if len(rest) < TAG_MAX and not final:
                return None
            self.report.strips["html"] += 1
            self._removed(buf)
            return 1                                                   # unterminated: drop only the '<'
        self.report.strips["html"] += 1
        self._removed(buf)
        return j - i + 1

    def _paren(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        rest = s[i:]
        j = rest.find(")")
        if j == -1:
            tail = rest[1:].lstrip()
            could_be_marker = (tail == "" or tail[0] in "sS") and len(rest) < MARKER_MAX
            if could_be_marker and not final:
                return None
            self._put(buf, "(")
            return 1
        cand = rest[: j + 1]
        if _PAREN_MARKER.match(cand):
            out = self._note_marker(_IDS.findall(cand))
            if out:
                self._put(buf, out)
            else:
                self._removed(buf)
            return j + 1
        self._put(buf, "(")
        return 1

    def _close_bracket(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        """A ']' that no bracket construct consumed. If '(' follows, the "(target)" would make a live markdown link
        for ANY earlier '[' (including nested ones the construct parser left alone): drop the target."""
        if i + 1 >= len(s):
            if not final:
                return None
            self._put(buf, "]")
            return 1
        if s[i + 1] != "(":
            self._put(buf, "]")
            return 1
        k = s.find(")", i + 2)
        if k == -1 or k - (i + 1) > LINK_URL_MAX:
            if k == -1 and len(s) - i < LINK_URL_MAX and not final:
                return None
            self._put(buf, "]")                                        # too long to be a target: the '(' is plain text
            return 1
        self.report.strips["link"] += 1
        self._put(buf, "]")
        self._removed(buf)
        return k - i + 1

    def _bracket(self, s: str, i: int, final: bool, buf: list[str]) -> Optional[int]:
        image = s[i] == "!"
        start = i + 1 if image else i                                  # index of '['
        j = s.find("]", start + 1)
        if j == -1:
            if len(s) - start < LINK_TEXT_MAX and not final:
                return None
            self._put(buf, s[i])                                       # not a bracket construct: literal
            return 1
        if j - start > LINK_TEXT_MAX + 1:
            self._put(buf, s[i])
            return 1
        inner = s[start + 1:j]
        if "[" in inner:                                               # nested: parse the INNERMOST '[' first
            self._put(buf, s[i])
            return 1
        after = j + 1
        if after >= len(s) and not final:
            return None                                                # need to see whether '(' follows
        has_paren = after < len(s) and s[after] == "("
        consumed_to = after
        if has_paren:
            k = s.find(")", after + 1)
            if k == -1:
                if len(s) - after < LINK_URL_MAX and not final:
                    return None
                has_paren = False                                      # unterminated: the '(' is ordinary text
            elif k - after > LINK_URL_MAX:
                has_paren = False
            else:
                consumed_to = k + 1
        if image:
            if has_paren:
                self.report.strips["image"] += 1                       # alt text can carry data too: drop it all
                self._removed(buf)
                return consumed_to - i
            self._put(buf, "!")                                        # "![x]" with no URL is just text: emit the '!' and
            return 1                                                   # let the '[…]' be parsed normally ("![S9]" is a marker)
        if _MARKER_INNER.match(inner):
            out = self._note_marker(_IDS.findall(inner))
            if out:
                self._put(buf, out)
            else:
                self._removed(buf)
            if has_paren:
                self.report.strips["link"] += 1
                self._sep = True
            return consumed_to - i
        if has_paren:
            self.report.strips["link"] += 1
            self._removed(buf)
            self._put(buf, self._scrub_inline(inner))                  # keep the visible text, drop the URL
            self._sep = True
            return consumed_to - i
        self._put(buf, self._literal_bracket(inner))
        return after - i

    def _literal_bracket(self, inner: str) -> str:
        return "[" + self._scrub_inline(inner) + "]"

    def _scrub_inline(self, text: str) -> str:
        """Scrub text that was inside brackets. Same rules, but no hold-back (it is complete)."""
        sub = StreamScrubber(self._valid, self._canary)
        out = sub.feed(text) + sub.finish()
        for k, v in sub.report.strips.items():
            self.report.strips[k] += v
        self.report.removed.extend(sub.report.removed)
        for v in sub.report.valid:
            if v not in self.report.valid:
                self.report.valid.append(v)
        if sub.report.canary_tripped:
            self.report.canary_tripped = True
        return out
