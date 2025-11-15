package com.tripplanner.TripPlanner.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.filters.RateLimitFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Filter to rate limit incoming requests
 *
 * NOTE: This is registered as a Spring Security filter in SecurityConfig
 * to ensure it runs AFTER authentication is loaded into SecurityContext
 */
public class RateLimitingFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(RateLimitingFilter.class);

    // Allow 50 requests per minute per IP
    private static final int MAX_REQUESTS_PER_MINUTE = 50;
    private static final long TIME_WINDOW_MS = 60_000; // 1 minute

    private final ConcurrentHashMap<String, RateLimitEntry> requestCounts = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String clientIp = getClientIp(httpRequest);

        // Allow localhost to bypass rate limiting
        if (isLocalhost(clientIp)) {
            chain.doFilter(request, response);
            return;
        }

        // Allow authenticated users to bypass rate limiting
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()
                && !authentication.getPrincipal().equals("anonymousUser")) {
            logger.debug("Bypassing rate limit for authenticated user");
            chain.doFilter(request, response);
            return;
        }

        long currentTime = System.currentTimeMillis();

        RateLimitEntry entry = requestCounts.computeIfAbsent(clientIp,
                k -> new RateLimitEntry(currentTime));

        // Reset if time window has passed
        if (currentTime - entry.windowStart.get() > TIME_WINDOW_MS) {
            entry.count.set(0);
            entry.windowStart.set(currentTime);
        }

        if (entry.count.incrementAndGet() > MAX_REQUESTS_PER_MINUTE) {
            logger.debug("Rate limit exceeded for IP: {}", clientIp);
            httpResponse.setStatus(429);
            return;
        }

        // Clean up old entries periodically
        if (requestCounts.size() > 1000) {
            cleanupOldEntries(currentTime);
        }

        chain.doFilter(request, response);
    }

    private void cleanupOldEntries(long currentTime) {
        requestCounts.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > TIME_WINDOW_MS * 2);
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // Helper to check if IP is localhost
    private boolean isLocalhost(String clientIp) {
        return "127.0.0.1".equals(clientIp)
                || "0:0:0:0:0:0:0:1".equals(clientIp)
                || "localhost".equals(clientIp);
    }

    private static class RateLimitEntry {
        final AtomicInteger count = new AtomicInteger(0);
        final AtomicLong windowStart;

        RateLimitEntry(long windowStart) {
            this.windowStart = new AtomicLong(windowStart);
        }
    }
}
