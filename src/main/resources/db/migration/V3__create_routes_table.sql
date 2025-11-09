-- Create routes table
CREATE TABLE routes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    fuel_consumption DECIMAL(5,2) NOT NULL DEFAULT 7.0,
    fuel_cost_per_liter DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'UAH',
    total_distance DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create waypoints table
CREATE TABLE waypoints (
    id BIGSERIAL PRIMARY KEY,
    route_id BIGINT NOT NULL,
    position_order INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    CONSTRAINT fk_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_routes_user_id ON routes(user_id);
CREATE INDEX idx_waypoints_route_id ON waypoints(route_id);

-- Create feature access table for premium features
CREATE TABLE feature_access (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    route_planner_enabled BOOLEAN DEFAULT FALSE,
    granted_at TIMESTAMP,
    granted_by VARCHAR(255),
    notes TEXT,
    CONSTRAINT fk_feature_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create access requests table for friend invitations
CREATE TABLE access_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    feature_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    processed_by VARCHAR(255),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    CONSTRAINT fk_request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_access_requests_status ON access_requests(status);
