"""CI guard: editing a chat prompt without bumping its version fails the build (the version is stored on every assistant message).

To change a prompt: edit src/prompts/<file>, bump `# prompt_version:` and its changelog line, re-run the chat evals, then update the
pinned (version, sha256-of-the-LF-normalized-file) below.
"""

from __future__ import annotations

import hashlib
import pathlib

import pytest

PROMPTS = pathlib.Path(__file__).resolve().parents[3] / "src" / "prompts"
PINNED = {
    "chat_system.txt": ("chat-system-v1.0", "a99795d300c79f0305d030cc4bddb8fe942fbb731de089eae19c718c0de3c3c9"),
    "chat_condense.txt": ("chat-condense-v1.0", "98dbc29d0b3561273e6b27551f7827a30e68cb75e6bd0e17f12c7dcaf588b6a0"),
    "chat_intent.txt": ("chat-intent-v1.0", "c2762cdbd2dcbe44b86e6ae9228822b466efb80f3721db6f320607a0c91c8efb"),
    "chat_memory_summary.txt": ("chat-memory-v1.0", "1e41788318534339751c611278670f0343f130a5b86ba7d0a476de5ddcb447fd"),
}


@pytest.mark.parametrize("name", sorted(PINNED))
def test_prompt_hash_matches_its_pinned_version(name):
    text = (PROMPTS / name).read_bytes().decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    version, digest = PINNED[name]
    assert text.splitlines()[0] == f"# prompt_version: {version}", f"{name}: version header changed without updating the pin"
    assert hashlib.sha256(text.encode("utf-8")).hexdigest() == digest, (
        f"{name} changed without a version bump: bump '# prompt_version:' and pin the new hash")


def test_system_prompt_has_every_placeholder_the_builder_fills():
    text = (PROMPTS / "chat_system.txt").read_text(encoding="utf-8")
    for ph in ("{{NONCE}}", "{{CANARY}}", "{{TODAY}}", "{{TZ}}", "{{WEEKDAY}}"):
        assert ph in text
