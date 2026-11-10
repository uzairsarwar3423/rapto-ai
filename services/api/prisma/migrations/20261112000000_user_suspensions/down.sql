-- Manual rollback for 20261112000000_user_suspensions (NOT executed by Prisma).
-- Suspension history is lost. Safe to run only while no code writes to the table (Day 8 actions not yet deployed).
DROP TABLE IF EXISTS "user_suspensions";
