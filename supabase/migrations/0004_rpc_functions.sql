-- Migration: 0004_rpc_functions
-- Defines the two RPC functions called by Spring Boot (AiAccessService):
--
--   is_admin(p_email text) → boolean
--     SECURITY DEFINER STABLE: runs as the defining role; result is cacheable
--     within a single statement. Used to gate admin-only Studio operations
--     and future admin API endpoints.
--
--   increment_ai_usage(p_user_id text, p_tokens int, p_cost numeric) → void
--     SECURITY DEFINER: runs as the defining role so it can write to
--     ai_usage_tracking even when called via an authenticated (or anon) role.
--     Uses ON CONFLICT upsert — safe to call multiple times for the same period.
--
-- Both are idempotent via CREATE OR REPLACE FUNCTION.
-- REVOKE / GRANT blocks are also idempotent.

-- ─────────────────────────────────────────────
-- is_admin
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin(p_email text)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   admin_users
        WHERE  email = p_email
    );
$$;

-- Lock down PUBLIC execute — service_role only.
-- v1 does not forward user JWTs to Supabase; only service_role calls RPCs.
-- Restrict to prevent admin-email enumeration via anon+JWT path.
REVOKE ALL ON FUNCTION is_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_admin(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION is_admin(text) TO service_role;

-- ─────────────────────────────────────────────
-- increment_ai_usage
-- ─────────────────────────────────────────────
-- Period key is 'YYYY-MM' (UTC), matching the CHECK constraint on ai_usage_tracking.
-- p_cost is the USD cost of the call, e.g. 0.0042.
-- Returns void — Spring Boot fires-and-forgets (no return value to parse).
CREATE OR REPLACE FUNCTION increment_ai_usage(
    p_user_id text,
    p_tokens  int,
    p_cost    numeric
)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE
    v_period text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
    INSERT INTO ai_usage_tracking (
        user_id,
        period_month,
        request_count,
        token_count,
        cost_usd,
        last_request_at
    )
    VALUES (
        p_user_id,
        v_period,
        1,
        p_tokens,
        p_cost,
        now()
    )
    ON CONFLICT (user_id, period_month) DO UPDATE
        SET request_count   = ai_usage_tracking.request_count + 1,
            token_count     = ai_usage_tracking.token_count   + EXCLUDED.token_count,
            cost_usd        = ai_usage_tracking.cost_usd      + EXCLUDED.cost_usd,
            last_request_at = now();
END;
$$;

-- Only service_role may call increment_ai_usage.
-- Users do not increment their own counters; all writes are server-side.
REVOKE ALL ON FUNCTION increment_ai_usage(text, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_ai_usage(text, int, numeric) TO service_role;
