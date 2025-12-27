package com.tripplanner.TripPlanner.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration properties for AI rate limiting and caching
 * Values can be overridden in application.properties
 */
@Configuration
@ConfigurationProperties(prefix = "ai")
@Data
public class AiRateLimitConfig {

    /**
     * Rate limit configuration
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
        private Tier unauthenticated = new Tier(5, 20);
        private Tier authenticated = new Tier(10, 50);

        @Data
        public static class Tier {
            private int hourly;
            private int daily;

            public Tier() {
            }

            public Tier(int hourly, int daily) {
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
