-- Reverses 004. The ledger is DROPPED (it is derived billing data; export it first if you need it).
DROP POLICY IF EXISTS chat_ledger_tenant_isolation ON rag.chat_usage_ledger;
DROP TABLE  IF EXISTS rag.chat_usage_ledger;
DROP VIEW   IF EXISTS rag.v_chat_meeting_access;
DROP VIEW   IF EXISTS rag.v_chat_members;
DROP VIEW   IF EXISTS rag.v_chat_meetings;
DROP VIEW   IF EXISTS rag.v_chat_action_items;
DROP VIEW   IF EXISTS rag.v_chat_commitments;
