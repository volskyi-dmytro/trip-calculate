-- Create trip_receipts table
-- Immutable snapshot of a calculated trip, shared via /r/{slug}.
-- Deliberately separate from routes: editing a saved route must never
-- change what an already-shared receipt link shows.
CREATE TABLE trip_receipts (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(8) NOT NULL UNIQUE,
    origin_label VARCHAR(120),
    destination_label VARCHAR(120),
    distance_km NUMERIC(12,2) NOT NULL,
    fuel_consumption NUMERIC(12,2) NOT NULL,
    fuel_price NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    people INTEGER NOT NULL,
    total_cost NUMERIC(12,2) NOT NULL,
    cost_per_person NUMERIC(12,2) NOT NULL,
    locale VARCHAR(5) NOT NULL,
    route_geometry TEXT,
    user_id BIGINT,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    view_count BIGINT NOT NULL DEFAULT 0,
    cta_click_count BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_trip_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Note: the UNIQUE constraint on slug above already creates a unique index,
-- satisfying the entity's @Index(name = "idx_trip_receipts_slug", unique = true).
-- Only the user_id lookup index needs to be created explicitly.
CREATE INDEX idx_trip_receipts_user_id ON trip_receipts(user_id);
