-- Migration: 0003_ai_usage_tracking
-- Creates the ai_usage_tracking table used by increment_ai_usage() RPC.
-- One row per (user_id, period_month). period_month is 'YYYY-MM' (text, not date)
-- so the format is self-documenting and avoids timezone ambiguity in the period key.
-- Writes happen exclusively via the increment_ai_usage() RPC (SECURITY DEFINER).
-- Spring Boot never writes to this table directly.
--
-- Idempotent: safe to run multiple times on the same project.

-- ─────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
    id              bigserial    PRIMARY KEY,
    user_id         text         NOT NULL,
    -- period_month format: 'YYYY-MM'. Enforced with a CHECK constraint.
    period_month    text         NOT NULL
                                 CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
    request_count   int          NOT NULL DEFAULT 0,
    token_count     int          NOT NULL DEFAULT 0,
    -- cost_usd: numeric(10,6) — up to $9999.999999 per period, micro-dollar precision
    cost_usd        numeric(10,6) NOT NULL DEFAULT 0,
    last_request_at timestamptz
);

-- ─────────────────────────────────────────────
-- Unique constraint
-- ─────────────────────────────────────────────
-- The ON CONFLICT target in increment_ai_usage() relies on this constraint.
-- IF NOT EXISTS is not standard SQL for constraints, so we guard via a DO block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_constraint
        WHERE  conrelid = 'ai_usage_tracking'::regclass
        AND    conname  = 'ai_usage_tracking_user_id_period_month_key'
    ) THEN
        ALTER TABLE ai_usage_tracking
            ADD CONSTRAINT ai_usage_tracking_user_id_period_month_key
            UNIQUE (user_id, period_month);
    END IF;
END;
$$;

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
-- Fast lookup by user (most common: "what has this user used this month?")
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_user_id
    ON ai_usage_tracking (user_id);

-- Fast scan by period (admin reporting: "what did everyone use in 2026-04?")
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_period_month
    ON ai_usage_tracking (period_month);

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
ALTER TABLE ai_usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_tracking FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- Policies
-- ─────────────────────────────────────────────
-- service_role: blanket access for Spring Boot server-side operations.
DROP POLICY IF EXISTS "service_role_all_ai_usage_tracking" ON ai_usage_tracking;
CREATE POLICY "service_role_all_ai_usage_tracking"
    ON ai_usage_tracking
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Self-read (authenticated): a user may read their own usage rows (all periods).
-- No INSERT / UPDATE / DELETE — all writes go through increment_ai_usage() RPC only.
-- The (SELECT ...) wrapper prevents per-row initPlan re-evaluation.
DROP POLICY IF EXISTS "self_read_ai_usage_tracking" ON ai_usage_tracking;
CREATE POLICY "self_read_ai_usage_tracking"
    ON ai_usage_tracking
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'sub'));

-- Anon: denied by default (RLS on, no matching policy).
