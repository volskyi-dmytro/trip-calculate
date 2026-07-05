package com.tripplanner.TripPlanner.filter;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Anonymous receipt creation writes rows to our DB on behalf of strangers;
 * the hourly cap is the abuse boundary the spec commits to (5 anon / 30 auth).
 */
class ReceiptCreationRateLimiterTest {

    private final ReceiptCreationRateLimiter limiter = new ReceiptCreationRateLimiter();

    @Test
    void anonymousAllowsFivePerHourThenBlocks() {
        for (int i = 0; i < 5; i++) {
            assertTrue(limiter.tryAcquire("1.2.3.4", false), "request " + (i + 1) + " should pass");
        }
        assertFalse(limiter.tryAcquire("1.2.3.4", false), "6th request should be blocked");
    }

    @Test
    void authenticatedAllowsThirtyPerHour() {
        for (int i = 0; i < 30; i++) {
            assertTrue(limiter.tryAcquire("1.2.3.4", true), "request " + (i + 1) + " should pass");
        }
        assertFalse(limiter.tryAcquire("1.2.3.4", true));
    }

    @Test
    void limitsAreTrackedPerIp() {
        for (int i = 0; i < 5; i++) {
            limiter.tryAcquire("1.1.1.1", false);
        }
        assertTrue(limiter.tryAcquire("2.2.2.2", false), "different IP has its own bucket");
    }
}
