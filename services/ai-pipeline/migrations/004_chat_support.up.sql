-- ─────────────────────────────────────────────────────────────────────────────
-- 004 · Chat support (Day 58)
--
--  * ANALYTICS / HYDRATION VIEWS. The runtime role `vocaply_ai_app` must never be granted SELECT on the core
--    tables: with `SET app.current_team_id` it would still see every column (tokens, emails, billing). Instead it
--    gets narrow, read-only views with
--      - a COLUMN ALLOW-LIST (no email, no meeting URL, no raw transcript pointers),
--      - the TENANT PREDICATE on app.current_team_id (fails closed when the setting is missing),
--      - security_barrier, so a caller-supplied function can never see rows the predicate filters out.
--    A view runs with its OWNER's rights, so no grant on public.* is needed (same design as 003).
--    Analytics SQL ALSO carries an explicit `team_id = $1` (defense in depth + auditable statements).
--
--  * rag.chat_usage_ledger — the AUTHORITATIVE per-stage cost ledger. Redis holds the fast quota counters; this
--    table rebuilds them (scripts/reconcile_quota.py) and feeds billing reconciliation. One row per
--    (request_id, stage): the UNIQUE key makes the outbox flush idempotent. No FK to teams on purpose: the
--    ledger must outlive a team deletion for audit. RLS FORCEd, fail-closed, like rag.embeddings.
--
-- Table/column names follow the Prisma schema (services/api/prisma/schema.prisma): Commitment, ActionItem,
-- Meeting, MeetingParticipant, User. If Prisma renames a column this migration fails loudly at apply time
-- (CREATE VIEW validates every column) instead of silently returning wrong data.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.commitments') IS NULL OR to_regclass('public.action_items') IS NULL
     OR to_regclass('public.meetings') IS NULL OR to_regclass('public.users') IS NULL
     OR to_regclass('public.meeting_participants') IS NULL THEN
    RAISE EXCEPTION 'public.commitments / action_items / meetings / users / meeting_participants must exist (apply the Prisma migrations first)';
  END IF;
END $$;

-- ── commitments (current status, owner, due date: hydrated at query time, ADR-5) ──────────────
CREATE VIEW rag.v_chat_commitments WITH (security_barrier = true) AS
  SELECT c.id,
         c."teamId"                              AS team_id,
         c."meetingId"                           AS meeting_id,
         c."ownerId"                             AS owner_id,
         COALESCE(u.name, c."ownerNameRaw")      AS owner_name,
         c.text                                  AS text,
         c.status::text                          AS status,
         c."dueDate"                             AS due_date,
         c."createdAt"                           AS created_at,
         c."fulfilledAt"                         AS fulfilled_at
    FROM public.commitments c
    LEFT JOIN public.users u ON u.id = c."ownerId" AND u."deletedAt" IS NULL
   WHERE c."teamId" = NULLIF(current_setting('app.current_team_id', true), '');

-- ── action items ─────────────────────────────────────────────────────────────
CREATE VIEW rag.v_chat_action_items WITH (security_barrier = true) AS
  SELECT a.id,
         a."teamId"                              AS team_id,
         a."meetingId"                           AS meeting_id,
         a."assigneeId"                          AS assignee_id,
         COALESCE(u.name, a."assigneeNameRaw")   AS assignee_name,
         a.text                                  AS text,
         CASE WHEN a.completed THEN 'COMPLETED' ELSE 'OPEN' END AS status,
         a."dueDate"                             AS due_date,
         a."completedAt"                         AS completed_at,
         a."createdAt"                           AS created_at
    FROM public.action_items a
    LEFT JOIN public.users u ON u.id = a."assigneeId" AND u."deletedAt" IS NULL
   WHERE a."teamId" = NULLIF(current_setting('app.current_team_id', true), '');

-- ── meetings ─────────────────────────────────────────────────────────────────
CREATE VIEW rag.v_chat_meetings WITH (security_barrier = true) AS
  SELECT m.id,
         m."teamId"                              AS team_id,
         m.title                                 AS title,
         m."scheduledAt"                         AS scheduled_at,
         m.status::text                          AS status
    FROM public.meetings m
   WHERE m."teamId" = NULLIF(current_setting('app.current_team_id', true), '');

-- ── team roster (name resolution for "Ahmed's commitments") ──────────────────
CREATE VIEW rag.v_chat_members WITH (security_barrier = true) AS
  SELECT u.id                                    AS user_id,
         u."teamId"                              AS team_id,
         u.name                                  AS name
    FROM public.users u
   WHERE u."teamId" = NULLIF(current_setting('app.current_team_id', true), '')
     AND u."deletedAt" IS NULL;

-- ── who attended what (Q1 access scope: attendee_only mode) ──────────────────
CREATE VIEW rag.v_chat_meeting_access WITH (security_barrier = true) AS
  SELECT m."teamId"                              AS team_id,
         p."meetingId"                           AS meeting_id,
         p."userId"                              AS user_id
    FROM public.meeting_participants p
    JOIN public.meetings m ON m.id = p."meetingId"
   WHERE p."userId" IS NOT NULL
     AND m."teamId" = NULLIF(current_setting('app.current_team_id', true), '');

REVOKE ALL ON rag.v_chat_commitments, rag.v_chat_action_items, rag.v_chat_meetings,
              rag.v_chat_members, rag.v_chat_meeting_access FROM PUBLIC;
GRANT SELECT ON rag.v_chat_commitments, rag.v_chat_action_items, rag.v_chat_meetings,
                rag.v_chat_members, rag.v_chat_meeting_access TO vocaply_ai_app;

-- ── usage ledger ─────────────────────────────────────────────────────────────
CREATE TABLE rag.chat_usage_ledger (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id     text           NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  team_id        text           NOT NULL CHECK (length(team_id) BETWEEN 1 AND 64),
  user_id        text,
  stage          text           NOT NULL CHECK (length(stage) BETWEEN 1 AND 40),
  provider       text           NOT NULL,
  model          text           NOT NULL,
  input_tokens   integer        NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  integer        NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd       numeric(14, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  estimated      boolean        NOT NULL DEFAULT false,
  category       text           NOT NULL DEFAULT 'chat' CHECK (category IN ('chat', 'system', 'unmetered')),
  counts_as_query boolean       NOT NULL DEFAULT false,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_ledger_request_stage UNIQUE (request_id, stage)
);

CREATE INDEX idx_chat_ledger_team_time ON rag.chat_usage_ledger (team_id, created_at DESC);

ALTER TABLE rag.chat_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag.chat_usage_ledger FORCE  ROW LEVEL SECURITY;

CREATE POLICY chat_ledger_tenant_isolation ON rag.chat_usage_ledger
  FOR ALL TO vocaply_ai_app
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), ''))
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), ''));

-- Append-only for the runtime role: it can add and read its own team's rows, never edit or delete them.
GRANT SELECT, INSERT ON rag.chat_usage_ledger TO vocaply_ai_app;

ANALYZE rag.chat_usage_ledger;
