-- V5__create_fuel_tables.sql
-- Country-average fuel prices + FX rates for the fuel-price agent.
-- Written by the agent service's daily refresh jobs; read by the agent's
-- fuel_enrichment node and Spring's GET /api/fuel-prices.
-- Seed rows let the feature work before the first refresh ever runs.

CREATE TABLE IF NOT EXISTS fuel_prices (
    country_code CHAR(2)      NOT NULL,
    fuel_type    VARCHAR(10)  NOT NULL CHECK (fuel_type IN ('petrol','diesel','lpg')),
    price        NUMERIC(8,3) NOT NULL CHECK (price > 0),
    currency     CHAR(3)      NOT NULL,
    source       VARCHAR(64)  NOT NULL,
    fetched_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (country_code, fuel_type)
);

CREATE TABLE IF NOT EXISTS fx_rates (
    base       CHAR(3)       NOT NULL,
    quote      CHAR(3)       NOT NULL,
    rate       NUMERIC(12,6) NOT NULL CHECK (rate > 0),
    fetched_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (base, quote)
);

-- Seed: approximate mid-2026 averages; the first refresh overwrites them.
-- EU prices in EUR (matches the Oil Bulletin's EUR columns), Ukraine in UAH.
INSERT INTO fuel_prices (country_code, fuel_type, price, currency, source) VALUES
  ('UA','petrol',58.90,'UAH','seed'), ('UA','diesel',56.50,'UAH','seed'), ('UA','lpg',34.00,'UAH','seed'),
  ('PL','petrol', 1.42,'EUR','seed'), ('PL','diesel', 1.45,'EUR','seed'), ('PL','lpg', 0.68,'EUR','seed'),
  ('SK','petrol', 1.58,'EUR','seed'), ('SK','diesel', 1.52,'EUR','seed'), ('SK','lpg', 0.62,'EUR','seed'),
  ('HU','petrol', 1.50,'EUR','seed'), ('HU','diesel', 1.53,'EUR','seed'), ('HU','lpg', 0.75,'EUR','seed'),
  ('RO','petrol', 1.44,'EUR','seed'), ('RO','diesel', 1.47,'EUR','seed'), ('RO','lpg', 0.72,'EUR','seed'),
  ('DE','petrol', 1.75,'EUR','seed'), ('DE','diesel', 1.65,'EUR','seed'), ('DE','lpg', 0.98,'EUR','seed'),
  ('AT','petrol', 1.62,'EUR','seed'), ('AT','diesel', 1.60,'EUR','seed'), ('AT','lpg', 1.05,'EUR','seed'),
  ('CZ','petrol', 1.52,'EUR','seed'), ('CZ','diesel', 1.48,'EUR','seed'), ('CZ','lpg', 0.70,'EUR','seed'),
  ('IT','petrol', 1.80,'EUR','seed'), ('IT','diesel', 1.72,'EUR','seed'), ('IT','lpg', 0.73,'EUR','seed'),
  ('FR','petrol', 1.78,'EUR','seed'), ('FR','diesel', 1.70,'EUR','seed'), ('FR','lpg', 0.95,'EUR','seed')
ON CONFLICT (country_code, fuel_type) DO NOTHING;

INSERT INTO fx_rates (base, quote, rate) VALUES
  ('USD','UAH',41.800000),
  ('EUR','UAH',45.600000)
ON CONFLICT (base, quote) DO NOTHING;
