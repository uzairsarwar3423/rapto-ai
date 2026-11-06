-- Reverses 003. Extensions are kept.
DROP VIEW  IF EXISTS rag.v_rag_source_context;
DROP INDEX IF EXISTS rag.idx_embeddings_chunk_tsv;
ALTER TABLE IF EXISTS rag.embeddings DROP COLUMN IF EXISTS chunk_tsv;
