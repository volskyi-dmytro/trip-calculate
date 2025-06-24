package com.tripplanner.TripPlanner.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.catalina.filters.RateLimitFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;


@Component
public class RateLimitingFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(RateLimitingFilter.class);

    // Allow 50 requests per minute per IP
    private static final int MAX_REQUESTS_PER_MINUTE = 50;
    private final ConcurrentHashMap<String, AtomicInteger> requestCounts = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String clientIp = getClientIp(httpRequest);

        // Simple rate limiting
        AtomicInteger count = requestCounts.computeIfAbsent(clientIp, k -> new AtomicInteger(0));

        if (count.incrementAndGet() > MAX_REQUESTS_PER_MINUTE) {
            logger.debug("Rate limit exceeded for IP: {}", clientIp);
            httpResponse.setStatus(429);
            return;
        }

        // Reset counter periodically (simple approach)
        if (count.get() % 100 == 0) {
            requestCounts.clear(); // Reset all counters
        }

        chain.doFilter(request, response);
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
