CREATE TABLE cars (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    make_model        VARCHAR(150),
    fuel_type         VARCHAR(10) NOT NULL,
    fuel_consumption  NUMERIC(4,1) NOT NULL,
    is_default        BOOLEAN NOT NULL DEFAULT FALSE,
    source            VARCHAR(10) NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cars_user_id ON cars(user_id);
CREATE UNIQUE INDEX uq_cars_one_default_per_user ON cars(user_id) WHERE is_default;
