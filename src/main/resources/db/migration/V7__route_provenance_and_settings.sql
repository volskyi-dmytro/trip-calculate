-- P0-B: saved-route provenance and settings.
-- Additive and idempotent. Existing rows keep NULL in every new column, which
-- the API reports as quality "legacy" (Haversine totals): they are never
-- silently upgraded. NOT auto-applied: prod runs ddl-auto=validate and there
-- is no Flyway, so run this by hand BEFORE deploying the matching build.
-- Rollback: db/rollback/V7__route_provenance_and_settings_rollback.sql
ALTER TABLE routes ADD COLUMN IF NOT EXISTS passenger_count INTEGER DEFAULT 1; -- already in the entity but missing from V3
ALTER TABLE routes ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS departure_date DATE;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_duration_minutes INTEGER;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_quality VARCHAR(16);   -- road | approximate; NULL = legacy
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_source VARCHAR(32);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS calculation_version VARCHAR(32);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMP;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS chk_routes_distance_quality;
ALTER TABLE routes ADD CONSTRAINT chk_routes_distance_quality
    CHECK (distance_quality IS NULL OR distance_quality IN ('road', 'approximate'));
