# 🛡️ Zero-Data-Loss Production Migration Runbook
### Prisma ORM + Supabase PostgreSQL + PgBouncer

> **Authoritative DevOps & Database Engineering Guide**  
> *Targeted for Production SaaS Systems with Zero Downtime & Zero Data Loss Requirements.*

---

## 📑 Table of Contents
1. [The Golden Rule: Eliminating Database Resets Forever](#1-the-golden-rule-eliminating-database-resets-forever)
2. [Prisma Command Matrix & Production Guardrails](#2-prisma-command-matrix--production-guardrails)
3. [Supabase & PgBouncer Connection Architecture](#3-supabase--pgbouncer-connection-architecture)
4. [Step-by-Step Production Migration Workflow](#4-step-by-step-production-migration-workflow)
5. [Resolving Migration Conflicts & Schema Drift Safely](#5-resolving-migration-conflicts--schema-drift-safely)
6. [Zero-Downtime Schema Changes: The Expand & Contract Pattern](#6-zero-downtime-schema-changes-the-expand--contract-pattern)
7. [Rollback, Backup & Disaster Recovery Strategy](#7-rollback-backup--disaster-recovery-strategy)
8. [Production CI/CD Automation (GitHub Actions)](#8-production-cicd-automation-github-actions)

---

## 1. The Golden Rule: Eliminating Database Resets Forever

### Why `prisma migrate dev` asks to reset your database
When you execute `prisma migrate dev`, Prisma compares three elements:
1. Your local `schema.prisma`
2. The migration history files in `prisma/migrations`
3. A shadow database / target database state

If Prisma detects that **migration history files were modified**, **deleted**, **reordered across Git branches**, or **manually edited in production**, it considers the database state **divergent (drifted)** and prompts to drop and recreate the database (`reset`).

### ⛔ The 3 Fundamental Rules of Production Safety:
> [!CAUTION]
> 1. **NEVER run `prisma migrate dev` or `prisma db push` against Production or Staging databases.**
> 2. **NEVER delete, rename, or modify already-merged SQL files in `prisma/migrations/`.**
> 3. **ALWAYS use `DIRECT_URL` (Port 5432 / Direct Session) for migrations, NOT the PgBouncer Transaction Pooler (Port 6543).**

---

## 2. Prisma Command Matrix & Production Guardrails

| Command | Allowed Environments | Purpose | Data Safety |
| :--- | :--- | :--- | :--- |
| `prisma migrate dev` | 💻 **Local Development ONLY** | Creates new migration SQL files & applies them to local DB | ⚠️ **Can prompt DB reset** |
| `prisma migrate deploy` | 🚀 **Staging / Production CI/CD** | Applies pending unapplied migration files to production | ✅ **100% Safe (No DB reset)** |
| `prisma migrate resolve` | 🛠️ **Production Debugging** | Marks failed/applied migrations in `_prisma_migrations` table | ✅ **Safe metadata edit** |
| `prisma migrate diff` | 🔍 **Local / CI Debugging** | Generates SQL diff between schemas, DBs, or migrations | 🟢 **Read-only (No mutations)** |
| `prisma db push` | 🧪 **Prototyping / Shadow DB** | Syncs schema without generating migration files | ⚠️ **Bypasses migration history** |

---

## 3. Supabase & PgBouncer Connection Architecture

Supabase uses **PgBouncer** to manage connection limits. PgBouncer operates in two distinct modes:

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 DATABASE CONNECTION URLS                │
                  └─────────────────────────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
 ┌──────────────────────┐                              ┌──────────────────────┐
 │     DATABASE_URL     │                              │      DIRECT_URL      │
 │ (Transaction Pooler) │                              │  (Direct Connection) │
 │     Port: 6543       │                              │      Port: 5432       │
 └──────────┬───────────┘                              └──────────┬───────────┘
            │                                                     │
            ▼                                                     ▼
 ┌──────────────────────┐                              ┌──────────────────────┐
 │ Used by Express API  │                              │ Used ONLY by Prisma  │
 │ & Worker runtime for │                              │  CLI for schema DB   │
 │   fast app queries   │                              │     migrations       │
 └──────────────────────┘                              └──────────────────────┘
```

### Required `schema.prisma` Configuration:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // Transaction pooler (Port 6543)
  directUrl = env("DIRECT_URL")     // Session / Direct connection (Port 5432)
}
```

### Production Connection String Parameters:
- **`DATABASE_URL`**: `postgresql://user:pass@db.supabase.co:6543/postgres?pgbouncer=true&connection_limit=10`
- **`DIRECT_URL`**: `postgresql://user:pass@db.supabase.co:5432/postgres?connection_limit=1`

> [!IMPORTANT]
> Appending `?connection_limit=1` to `DIRECT_URL` during migrations prevents `EMAXCONNSESSION (max clients reached in session mode)` errors when running migrations against Supabase PgBouncer.

---

## 4. Step-by-Step Production Migration Workflow

### Phase 1: Local Feature Development
1. Create a feature branch:
   ```bash
   git checkout -b feature/add-user-preferences
   ```
2. Update `prisma/schema.prisma` with new models or fields.
3. Generate the migration locally:
   ```bash
   npx prisma migrate dev --name add_user_preferences
   ```
   *This creates a new folder in `prisma/migrations/20260726000000_add_user_preferences/migration.sql`.*

4. Test locally, commit migration files to Git:
   ```bash
   git add prisma/schema.prisma prisma/migrations/
   git commit -m "feat(db): add user preferences schema migration"
   git push origin feature/add-user-preferences
   ```

---

### Phase 2: Pull Request & Peer Review
1. Open a Pull Request on GitHub.
2. Ensure CI runs `prisma migrate diff` or validates that migration SQL is valid.
3. Merge PR into `main`.

---

### Phase 3: Automated Production Deployment
In CI/CD (or deploy script on VPS), run:
```bash
npx prisma migrate deploy
```
*`migrate deploy` applies unapplied migrations sequentially and NEVER prompts to reset the database.*

---

## 5. Resolving Migration Conflicts & Schema Drift Safely

### Scenario A: Migration Conflicts Between Merged Git Branches
**Problem**: Branch A created migration `20260725_feature_a` and Branch B created `20260725_feature_b`. When merging, migration order or checksums conflict.

#### Safe Resolution Steps:
1. Pull latest `main` into your feature branch:
   ```bash
   git checkout main && git pull origin main
   git checkout feature/my-branch
   git merge main
   ```
2. If Prisma complains about migration divergence locally:
   **DO NOT press `Y` to reset your database.**
3. Create a clean SQL diff without resetting:
   ```bash
   npx prisma migrate diff \
     --from-href "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma \
     --script > fix.sql
   ```
4. Review `fix.sql`, create a new migration manually:
   ```bash
   npx prisma migrate dev --name sync_branch_conflict --create-only
   ```
   Paste `fix.sql` contents into the generated `migration.sql` file, then apply locally:
   ```bash
   npx prisma migrate deploy
   ```

---

### Scenario B: A Production Migration Failed Mid-Execution (`P3009` Error)
**Problem**: Production deployment fails with:
`P3009: Found failed migrations in the target database: 20260725120000_add_column`

#### Safe Resolution Steps:
1. **Inspect what failed**:
   Connect to Supabase and check the state:
   ```sql
   SELECT migration_name, started_at, finished_at, rolled_back_at 
   FROM _prisma_migrations 
   ORDER BY started_at DESC LIMIT 5;
   ```
2. **If the SQL was partially applied and schema is valid**:
   Mark the migration as applied without re-running broken DDL:
   ```bash
   npx prisma migrate resolve --applied "20260725120000_add_column"
   ```
3. **If the SQL completely failed and changes were NOT applied**:
   Mark the migration as rolled back:
   ```bash
   npx prisma migrate resolve --rolled-back "20260725120000_add_column"
   ```
4. Re-run deployment:
   ```bash
   npx prisma migrate deploy
   ```

---

## 6. Zero-Downtime Schema Changes: The Expand & Contract Pattern

When modifying existing columns in production SaaS apps with active users, **never rename or drop columns in a single migration**. Running `ALTER TABLE RENAME COLUMN` will crash running API instances executing queries with old column names.

### Pattern: Expand & Contract (2-Phase Deployment)

```
PHASE 1: EXPAND                       PHASE 2: MIGRATE DATA                PHASE 3: CONTRACT
┌──────────────────────────┐          ┌──────────────────────────┐         ┌──────────────────────────┐
│ Add new column (nullable)│ ───────► │ Copy data & write to both│ ──────► │ Drop old column safely   │
│ Keep old column active   │          │ column versions          │         │ in next release          │
└──────────────────────────┘          └──────────────────────────┘         └──────────────────────────┘
```

#### Example: Renaming `fullName` to `name`
1. **Migration 1 (Expand)**: Add `name` as an optional column.
   ```sql
   ALTER TABLE "User" ADD COLUMN "name" TEXT;
   ```
2. **Code Release 1**: Update application code to read `name || fullName` and write to both `name` and `fullName`.
3. **Backfill Script**: Copy existing data:
   ```sql
   UPDATE "User" SET "name" = "fullName" WHERE "name" IS NULL;
   ```
4. **Migration 2 (Contract)**: Drop `fullName` after confirming no code uses it:
   ```sql
   ALTER TABLE "User" DROP COLUMN "fullName";
   ```

---

## 7. Rollback, Backup & Disaster Recovery Strategy

### 1. Forward-Only Migration Policy (Industry Standard)
In production relational databases, **rollbacks should be applied as new forward migrations**, rather than reverting database history states.
- To undo a column addition: Create a new migration that drops the column.
- To undo a table rename: Create a new migration that renames it back.

### 2. Supabase Point-In-Time-Recovery (PITR)
- Enable **PITR (Point-In-Time Recovery)** in Supabase Dashboard -> Database -> Backups.
- Allows restoring the database to any exact second within the retention window (7 to 30 days) prior to an erroneous migration.

---

## 8. Production CI/CD Automation (GitHub Actions)

Here is a production-hardened deployment workflow snippet for GitHub Actions:

```yaml
name: Production Zero-Downtime Deployment

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Execute Safe Prisma Migration Deploy
        env:
          # Force connection_limit=1 for PgBouncer stability
          DIRECT_URL: "${{ secrets.PROD_DIRECT_URL }}?connection_limit=1"
          DATABASE_URL: "${{ secrets.PROD_DATABASE_URL }}"
        run: |
          echo "🗄️ Running production database migrations..."
          npx prisma migrate deploy
```

---

### Summary Checklist for Engineering Team
- [x] Use `npx prisma migrate dev` **only locally**.
- [x] Use `npx prisma migrate deploy` in **production CI/CD**.
- [x] Use `DIRECT_URL` with `?connection_limit=1` for migrations.
- [x] Follow **Expand & Contract** for non-breaking column updates.
- [x] Use `npx prisma migrate resolve` to fix failed migration metadata without data loss.
