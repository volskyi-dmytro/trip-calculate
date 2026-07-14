package com.tripplanner.TripPlanner.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration properties for AI rate limiting and caching
 *
 * Authenticated public-beta defaults:
 * - Per Google user: 3/min, 20/hour, 10/day
 * - Process-wide: 30/min, 200/hour, 500/day
 *
 * Values can be overridden in application.properties using prefix "ai."
 * Example: ai.ratelimit.authenticated.minute=3
 *
 * @see application.properties for detailed configuration
 */
@Configuration
@ConfigurationProperties(prefix = "ai")
@Data
public class AiRateLimitConfig {

    /**
     * Per-user and process-wide limits.
     */
    private RateLimit ratelimit = new RateLimit();

    /**
     * Cache configuration
     */
    private Cache cache = new Cache();

    /**
     * Monitoring and alerting configuration
     */
    private Alert alert = new Alert();

    @Data
    public static class RateLimit {
        private Tier authenticated = new Tier(3, 20, 10);
        private Tier global = new Tier(30, 200, 500);
        private int maxIdentities = 1000;

        @Data
        public static class Tier {
            private int minute;
            private int hourly;
            private int daily;

            public Tier() {
            }

            public Tier(int minute, int hourly, int daily) {
                this.minute = minute;
                this.hourly = hourly;
                this.daily = daily;
            }
        }
    }

    @Data
    public static class Cache {
        private Ttl ttl = new Ttl();
        private Max max = new Max();

        @Data
        public static class Ttl {
            private int hours = 24;
        }

        @Data
        public static class Max {
            private int size = 500;
        }
    }

    @Data
    public static class Alert {
        private Daily daily = new Daily();
        private Error error = new Error();

        @Data
        public static class Daily {
            private int threshold = 400;
        }

        @Data
        public static class Error {
            private Rate rate = new Rate();

            @Data
            public static class Rate {
                private double threshold = 0.1;
            }
        }
    }
}
