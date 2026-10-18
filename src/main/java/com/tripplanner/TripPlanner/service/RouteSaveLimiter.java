package com.tripplanner.TripPlanner.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.HashMap;
import java.util.Map;

/** Fail-fast process-local admission; no waiting queue or retained idle user entries. */
@Component
public class RouteSaveLimiter {
    private final int globalLimit;
    private final int userLimit;
    private final Map<Long, Integer> activeUsers = new HashMap<>();
    private int active;

    public RouteSaveLimiter(@Value("${app.routes.save.max-active:4}") int globalLimit,
                            @Value("${app.routes.save.max-active-per-user:1}") int userLimit) {
        if (globalLimit < 1 || globalLimit > 1024 || userLimit < 1 || userLimit > globalLimit) {
            throw new IllegalArgumentException("Route save caps require 1 <= per-user <= global <= 1024");
        }
        this.globalLimit = globalLimit;
        this.userLimit = userLimit;
    }

    public synchronized Lease acquire(Long userId) {
        if (userId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        int userActive = activeUsers.getOrDefault(userId, 0);
        if (active >= globalLimit || userActive >= userLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "ROUTE_SAVE_BUSY");
        }
        active++;
        activeUsers.put(userId, userActive + 1);
        return new Lease(userId);
    }

    public final class Lease implements AutoCloseable {
        private final Long userId;
        private boolean closed;
        private Lease(Long userId) { this.userId = userId; }
        @Override public void close() {
            synchronized (RouteSaveLimiter.this) {
                if (closed) return;
                closed = true;
                active--;
                int remaining = activeUsers.get(userId) - 1;
                if (remaining == 0) activeUsers.remove(userId);
                else activeUsers.put(userId, remaining);
            }
        }
    }
}
