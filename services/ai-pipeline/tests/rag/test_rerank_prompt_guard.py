"""CI guard: editing the re-rank prompt without bumping its version fails the build.

The version and hash are recorded on every re-rank result, so a silent prompt edit
would make eval/traces from different prompts indistinguishable.

To change the prompt: edit src/prompts/rerank_system.txt, bump `# prompt_version:`
(and the changelog line), re-run the retrieval eval, then add the new pair below.
"""

from __future__ import annotations

from src.rag.reranker import load_rerank_prompt

# version → SHA-256 of the file with LF newlines
PINNED_PROMPTS = {
    "rerank-v1.0": "999678eed6f1fded2d8c0ccf6d86d0afbffc5c5c382e7d5765ab231c8932b3c7",
}


def test_prompt_hash_matches_its_pinned_version():
    prompt = load_rerank_prompt()
    assert prompt.version in PINNED_PROMPTS, (
        f"prompt version {prompt.version!r} is not pinned: add its hash {prompt.sha256} to PINNED_PROMPTS")
    assert prompt.sha256 == PINNED_PROMPTS[prompt.version], (
        "src/prompts/rerank_system.txt changed without a version bump: "
        f"bump '# prompt_version:' and pin the new hash {prompt.sha256}")
