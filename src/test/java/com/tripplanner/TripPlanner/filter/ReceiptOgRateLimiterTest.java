package com.tripplanner.TripPlanner.filter;

import org.junit.jupiter.api.Test;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

class ReceiptOgRateLimiterTest {
    @Test
    void perIpBudgetResetsAndDoesNotConsumeOtherIps() {
        var limiter = new ReceiptOgRateLimiter();
        long now = System.nanoTime();
        for (int i = 0; i < 60; i++) assertTrue(limiter.tryAcquire("one", now));
        assertFalse(limiter.tryAcquire("one", now));
        assertTrue(limiter.tryAcquire("two", now));
        assertTrue(limiter.tryAcquire("one", now + TimeUnit.MINUTES.toNanos(2)));
    }

    @Test
    void rotatingIpsCannotExceedGlobalBudget() {
        var limiter = new ReceiptOgRateLimiter();
        long now = System.nanoTime();
        for (int i = 0; i < 300; i++) assertTrue(limiter.tryAcquire("ip-" + i, now));
        assertFalse(limiter.tryAcquire("another-ip", now));
        assertTrue(limiter.tryAcquire("another-ip", now + TimeUnit.MINUTES.toNanos(2)));
    }
}
