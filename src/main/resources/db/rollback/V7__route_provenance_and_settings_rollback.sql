-- Reverts V7. Destroys the new provenance/settings data; passenger_count is
-- deliberately kept (the entity needs it and V3 never created it).
ALTER TABLE routes DROP CONSTRAINT IF EXISTS chk_routes_distance_quality;
ALTER TABLE routes DROP COLUMN IF EXISTS calculated_at;
ALTER TABLE routes DROP COLUMN IF EXISTS calculation_version;
ALTER TABLE routes DROP COLUMN IF EXISTS distance_source;
ALTER TABLE routes DROP COLUMN IF EXISTS distance_quality;
ALTER TABLE routes DROP COLUMN IF EXISTS total_duration_minutes;
ALTER TABLE routes DROP COLUMN IF EXISTS departure_date;
ALTER TABLE routes DROP COLUMN IF EXISTS fuel_type;
