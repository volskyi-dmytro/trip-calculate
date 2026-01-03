package com.tripplanner.TripPlanner.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration properties for AI rate limiting and caching
 *
 * Default Strategy (Beta Testing Phase):
 * - Authenticated (Beta Testers): 20/min, 400/hour, 1500/day
 * - Unauthenticated: 3/min, 10/hour, 30/day
 * - Premium (Future): 30/min, 600/hour, 2000/day
 *
 * Values can be overridden in application.properties using prefix "ai."
 * Example: ai.ratelimit.authenticated.minute=20
 *
 * @see application.properties for detailed configuration
 */
@Configuration
@ConfigurationProperties(prefix = "ai")
@Data
public class AiRateLimitConfig {

    /**
     * Rate limit configuration with three-tier system
     * Each tier has per-minute, per-hour, and per-day limits
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
        private Tier unauthenticated = new Tier(3, 10, 30);
        private Tier authenticated = new Tier(20, 400, 1500);
        private Tier premium = new Tier(30, 600, 2000);

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
            private int threshold = 1000;
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
