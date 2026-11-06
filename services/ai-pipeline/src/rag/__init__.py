"""RAG infrastructure (Day 56): embedding pipeline + tenant-isolated vector store.

Public surface for Day 57 (retriever / re-ranking):
    embed_chunks(chunks, client, db)            write path
    QueryEmbedder.embed_query(text)             query vector (LRU-cached)
    similarity_search(db, VectorSearchQuery)    raw top-K read path
    replace_source_chunks / delete_by_source    source lifecycle

Imports are lazy so `import src.rag` stays cheap and side-effect free.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "QueryEmbedder",
    "delete_by_source",
    "embed_chunks",
    "replace_source_chunks",
    "similarity_search",
]

_LAZY = {
    "embed_chunks": "src.rag.embedder",
    "QueryEmbedder": "src.rag.embedder",
    "similarity_search": "src.rag.vector_store",
    "replace_source_chunks": "src.rag.vector_store",
    "delete_by_source": "src.rag.vector_store",
}


def __getattr__(name: str) -> Any:
    if name in _LAZY:
        import importlib

        return getattr(importlib.import_module(_LAZY[name]), name)
    raise AttributeError(f"module 'src.rag' has no attribute {name!r}")
