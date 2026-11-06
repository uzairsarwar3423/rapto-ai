DROP FUNCTION IF EXISTS rag.requeue_stale_embedding_jobs(interval);
DROP FUNCTION IF EXISTS rag.claim_next_embedding_job();
DROP POLICY   IF EXISTS embedding_jobs_tenant_isolation ON rag.embedding_jobs;
DROP TABLE    IF EXISTS rag.embedding_jobs;
