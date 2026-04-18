-- Migration: 0001_admin_users
-- Creates the admin_users table with RLS enabled.
-- RLS is the defense-in-depth layer. Spring Boot uses the service_role key, which
-- bypasses RLS entirely. Policies here prevent accidental anon exposure and
-- prepare the table for future user-identity JWT forwarding.
--
-- Idempotent: safe to run multiple times on the same project.

-- ─────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
    user_id    text        PRIMARY KEY,
    email      text        UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
-- MUST be enabled. Never disable, even for testing.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Force RLS to apply to the table owner as well (belt-and-suspenders).
ALTER TABLE admin_users FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- Policies
-- ─────────────────────────────────────────────
-- Drop then recreate for idempotency.
-- service_role gets a blanket policy because it is an admin principal
-- (Spring Boot server-to-server only — this key never leaves the backend env).

DROP POLICY IF EXISTS "service_role_all_admin_users" ON admin_users;
CREATE POLICY "service_role_all_admin_users"
    ON admin_users
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No anon SELECT, INSERT, UPDATE, or DELETE policies are defined.
-- With RLS enabled and no matching policy, all anon operations are denied by default.

-- Self-read policy (forward-compatible): an authenticated user can read their own row
-- if/when Spring Boot begins forwarding user-identity JWTs to Supabase.
-- The (SELECT ...) wrapper is mandatory — it prevents per-row re-evaluation and
-- keeps the initPlan cache working correctly at scale.
DROP POLICY IF EXISTS "self_read_admin_users" ON admin_users;
CREATE POLICY "self_read_admin_users"
    ON admin_users
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'sub'));
