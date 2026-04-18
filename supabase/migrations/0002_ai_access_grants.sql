-- Migration: 0002_ai_access_grants
-- Creates the ai_access_grants table, an updated_at trigger, and RLS policies.
-- This is the source of truth for whether a user may call /api/ai/** endpoints.
-- Spring Boot (AiAccessService) reads this via service_role, caches in Redis (60s TTL).
--
-- Idempotent: safe to run multiple times on the same project.

-- ─────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_access_grants (
    user_id           text           PRIMARY KEY,
    enabled           boolean        NOT NULL DEFAULT false,
    monthly_token_cap int            NOT NULL DEFAULT 100000,
    monthly_req_cap   int            NOT NULL DEFAULT 500,
    -- daily_usd_cap: numeric(6,4) holds values up to 99.9999; sufficient for USD cap granularity
    daily_usd_cap     numeric(6,4)   NOT NULL DEFAULT 0.50,
    -- monthly_usd_cap: numeric(8,2) holds values up to 999999.99
    monthly_usd_cap   numeric(8,2)   NOT NULL DEFAULT 10.00,
    granted_by        text,
    granted_at        timestamptz    NOT NULL DEFAULT now(),
    updated_at        timestamptz    NOT NULL DEFAULT now(),
    notes             text
);

-- ─────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────
-- Creates (or replaces) a generic trigger function that stamps updated_at.
-- Placed here rather than a shared migration because 0002 is the first table that needs it.
-- If this function already exists from a previous run it is harmlessly replaced.
CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Drop trigger first for idempotency, then recreate.
DROP TRIGGER IF EXISTS trg_ai_access_grants_updated_at ON ai_access_grants;
CREATE TRIGGER trg_ai_access_grants_updated_at
    BEFORE UPDATE ON ai_access_grants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
ALTER TABLE ai_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_access_grants FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- Policies
-- ─────────────────────────────────────────────
-- service_role: blanket access (server-side Spring Boot only; key never in frontend).
DROP POLICY IF EXISTS "service_role_all_ai_access_grants" ON ai_access_grants;
CREATE POLICY "service_role_all_ai_access_grants"
    ON ai_access_grants
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Self-read (authenticated): a user may read their own grant row.
-- Split from UPDATE/INSERT/DELETE — users never modify their own grant.
-- The (SELECT ...) wrapper prevents per-row initPlan re-evaluation.
DROP POLICY IF EXISTS "self_read_ai_access_grants" ON ai_access_grants;
CREATE POLICY "self_read_ai_access_grants"
    ON ai_access_grants
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'sub'));

-- No INSERT / UPDATE / DELETE policy for authenticated or anon.
-- Only service_role (Spring Boot) may modify grant rows.
-- Anon is fully denied by default (RLS on, no matching policy).
