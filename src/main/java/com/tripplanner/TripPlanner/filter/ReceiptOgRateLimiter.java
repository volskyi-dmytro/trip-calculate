package com.tripplanner.TripPlanner.filter;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** PNG paths bypass the general filters, so bound lookups as well as renders here. */
@Component
public class ReceiptOgRateLimiter {
    private static final long WINDOW_NANOS = TimeUnit.MINUTES.toNanos(1);
    private static final int PER_IP = 60;
    private static final int GLOBAL = 300;
    private final Map<String, Integer> counts = new HashMap<>();
    private long windowStart = System.nanoTime();
    private int requests;

    public boolean tryAcquire(String clientIp) {
        return tryAcquire(clientIp, System.nanoTime());
    }

    synchronized boolean tryAcquire(String clientIp, long now) {
        if (now - windowStart >= WINDOW_NANOS) {
            counts.clear();
            requests = 0;
            windowStart = now;
        }
        int count = counts.getOrDefault(clientIp, 0);
        if (requests >= GLOBAL || count >= PER_IP) return false;
        // The global budget also bounds this map to at most 300 identities per window.
        counts.put(clientIp, count + 1);
        requests++;
        return true;
    }
}
