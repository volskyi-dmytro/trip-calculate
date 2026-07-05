package com.tripplanner.TripPlanner.filter;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Fixed-window per-IP limiter for POST /api/receipts, following the
 * in-memory pattern of RateLimitingFilter. Separate from the general
 * 50/min filter because receipt creation persists rows for anonymous
 * users and needs a much tighter hourly budget.
 */
@Component
public class ReceiptCreationRateLimiter {

    private static final int ANONYMOUS_PER_HOUR = 5;
    private static final int AUTHENTICATED_PER_HOUR = 30;
    private static final long WINDOW_MS = 60L * 60L * 1000L;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public boolean tryAcquire(String clientIp, boolean authenticated) {
        long now = System.currentTimeMillis();
        // Separate keys per auth state so logging in grants a fresh, larger bucket
        String key = (authenticated ? "auth:" : "anon:") + clientIp;
        int limit = authenticated ? AUTHENTICATED_PER_HOUR : ANONYMOUS_PER_HOUR;

        Window window = windows.computeIfAbsent(key, k -> new Window(now));
        if (now - window.start.get() > WINDOW_MS) {
            window.count.set(0);
            window.start.set(now);
        }
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> now - e.getValue().start.get() > WINDOW_MS * 2);
        }
        return window.count.incrementAndGet() <= limit;
    }

    private static class Window {
        final AtomicInteger count = new AtomicInteger(0);
        final AtomicLong start;

        Window(long start) {
            this.start = new AtomicLong(start);
        }
    }
}
