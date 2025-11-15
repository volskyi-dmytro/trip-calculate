package com.tripplanner.TripPlanner.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Filter to mitigate common attacks by rate limiting suspicious requests
 *
 * NOTE: This is registered as a Spring Security filter in SecurityConfig
 * to ensure it runs AFTER authentication is loaded into SecurityContext
 */
public class AttackMitigationFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(AttackMitigationFilter.class);
    private static final Logger securityLogger = LoggerFactory.getLogger("SECURITY");

    // Allow 30 requests per minute per IP (legitimate users won't hit this)
    private static final int MAX_REQUESTS_PER_MINUTE = 30;
    private static final long TIME_WINDOW_MS = 60_000; // 1 minute

    private final ConcurrentHashMap<String, RequestCounter> requestCounts = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String clientIp = getClientIp(httpRequest);
        String requestUri = httpRequest.getRequestURI();

        // Allow localhost to bypass mitigation
        if (isLocalhost(clientIp)) {
            chain.doFilter(request, response);
            return;
        }

        // Allow authenticated users to bypass attack mitigation rate limiting
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()
                && !authentication.getPrincipal().equals("anonymousUser")) {
            logger.debug("Bypassing attack mitigation for authenticated user on {}", requestUri);
            chain.doFilter(request, response);
            return;
        }

        // Check if this is a suspicious request
        boolean isSuspicious = isSuspiciousRequest(requestUri);

        // Apply stricter rate limiting for suspicious requests
        int maxRequests = isSuspicious ? 5 : MAX_REQUESTS_PER_MINUTE;

        if (isRateLimited(clientIp, maxRequests)) {
            if (isSuspicious) {
                securityLogger.warn("ATTACK BLOCKED: Rate limit exceeded for suspicious request from IP: {} to: {}",
                        clientIp, requestUri);
            }
            logger.debug("Rate limit exceeded for IP: {}", clientIp);
            httpResponse.setStatus(429);
            return;
        }

        chain.doFilter(request, response);
    }

    private boolean isSuspiciousRequest(String uri) {
        if (uri == null) return false;

        String lowerUri = uri.toLowerCase();
        return lowerUri.contains(".git") ||
                lowerUri.contains(".env") ||
                lowerUri.contains("config") ||
                lowerUri.contains("admin") ||
                lowerUri.contains("backup") ||
                lowerUri.contains(".aws") ||
                lowerUri.contains(".ssh") ||
                lowerUri.contains("phpinfo") ||
                lowerUri.endsWith(".bak") ||
                lowerUri.endsWith(".backup");
    }

    private boolean isRateLimited(String clientIp, int maxRequests) {
        long currentTime = System.currentTimeMillis();

        RequestCounter counter = requestCounts.computeIfAbsent(clientIp,
                k -> new RequestCounter(currentTime));

        // Reset counter if time window has passed
        if (currentTime - counter.getWindowStart() > TIME_WINDOW_MS) {
            counter.reset(currentTime);
        }

        // Check if limit exceeded
        if (counter.getCount() >= maxRequests) {
            return true;
        }

        // Increment counter
        counter.increment();

        // Clean up old entries periodically
        if (requestCounts.size() > 1000) {
            cleanupOldEntries(currentTime);
        }

        return false;
    }

    private void cleanupOldEntries(long currentTime) {
        requestCounts.entrySet().removeIf(entry ->
                currentTime - entry.getValue().getWindowStart() > TIME_WINDOW_MS * 2);
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }

        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }

        return request.getRemoteAddr();
    }

    // Helper to check if IP is localhost
    private boolean isLocalhost(String clientIp) {
        return "127.0.0.1".equals(clientIp)
                || "0:0:0:0:0:0:0:1".equals(clientIp)
                || "localhost".equals(clientIp);
    }

    // Inner class to track request counts
    private static class RequestCounter {
        private final AtomicInteger count = new AtomicInteger(0);
        private final AtomicLong windowStart;

        public RequestCounter(long windowStart) {
            this.windowStart = new AtomicLong(windowStart);
        }

        public int getCount() {
            return count.get();
        }

        public long getWindowStart() {
            return windowStart.get();
        }

        public void increment() {
            count.incrementAndGet();
        }

        public void reset(long newWindowStart) {
            count.set(0);
            windowStart.set(newWindowStart);
        }
    }

}
