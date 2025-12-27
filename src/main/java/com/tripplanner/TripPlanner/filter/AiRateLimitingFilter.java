package com.tripplanner.TripPlanner.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.UserRepository;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * AI-specific rate limiting filter with multi-tier limits
 * Applies only to /api/ai/** endpoints
 *
 * Tiers:
 * - Unauthenticated: 5 req/hour, 20 req/day
 * - Authenticated: 10 req/hour, 50 req/day
 */
public class AiRateLimitingFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(AiRateLimitingFilter.class);

    // Rate limits (configurable via application.properties)
    @Value("${ai.ratelimit.unauthenticated.hourly:5}")
    private int unauthHourlyLimit;

    @Value("${ai.ratelimit.unauthenticated.daily:20}")
    private int unauthDailyLimit;

    @Value("${ai.ratelimit.authenticated.hourly:10}")
    private int authHourlyLimit;

    @Value("${ai.ratelimit.authenticated.daily:50}")
    private int authDailyLimit;

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Time windows
    private static final long HOUR_MS = 60 * 60 * 1000;
    private static final long DAY_MS = 24 * 60 * 60 * 1000;

    // Rate limit tracking maps
    private final ConcurrentHashMap<String, RateLimitEntry> hourlyLimits = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RateLimitEntry> dailyLimits = new ConcurrentHashMap<>();

    public AiRateLimitingFilter(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String requestUri = httpRequest.getRequestURI();

        // Only apply to /api/ai/** endpoints
        if (!requestUri.startsWith("/api/ai/")) {
            chain.doFilter(request, response);
            return;
        }

        // Check if user is authenticated
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = auth != null && auth.isAuthenticated()
                && !auth.getPrincipal().equals("anonymousUser");

        String rateLimitKey;
        String userEmail = null;
        Long userId = null;
        int hourlyLimit;
        int dailyLimit;

        if (isAuthenticated) {
            // Use user ID as rate limit key
            try {
                OAuth2User oAuth2User = (OAuth2User) auth.getPrincipal();
                userEmail = oAuth2User.getAttribute("email");

                if (userEmail != null) {
                    var userOpt = userRepository.findByEmail(userEmail);
                    if (userOpt.isPresent()) {
                        userId = userOpt.get().getId();
                        rateLimitKey = "user:" + userId;
                    } else {
                        rateLimitKey = "email:" + userEmail;
                    }
                } else {
                    rateLimitKey = "auth:unknown";
                }

                hourlyLimit = authHourlyLimit;
                dailyLimit = authDailyLimit;

            } catch (Exception e) {
                logger.warn("Failed to extract user from authentication, treating as unauthenticated", e);
                rateLimitKey = "ip:" + getClientIp(httpRequest);
                hourlyLimit = unauthHourlyLimit;
                dailyLimit = unauthDailyLimit;
                isAuthenticated = false;
            }
        } else {
            // Use IP address as rate limit key
            rateLimitKey = "ip:" + getClientIp(httpRequest);
            hourlyLimit = unauthHourlyLimit;
            dailyLimit = unauthDailyLimit;
        }

        long currentTime = System.currentTimeMillis();

        // Check hourly limit
        RateLimitEntry hourlyEntry = hourlyLimits.computeIfAbsent(rateLimitKey,
                k -> new RateLimitEntry(currentTime));

        if (currentTime - hourlyEntry.windowStart.get() > HOUR_MS) {
            hourlyEntry.count.set(0);
            hourlyEntry.windowStart.set(currentTime);
        }

        if (hourlyEntry.count.incrementAndGet() > hourlyLimit) {
            logger.warn("Hourly AI rate limit exceeded for key: {}", rateLimitKey);
            sendRateLimitResponse(httpResponse, "hourly", hourlyEntry.windowStart.get() + HOUR_MS,
                    isAuthenticated ? "authenticated" : "unauthenticated");
            return;
        }

        // Check daily limit
        RateLimitEntry dailyEntry = dailyLimits.computeIfAbsent(rateLimitKey,
                k -> new RateLimitEntry(currentTime));

        if (currentTime - dailyEntry.windowStart.get() > DAY_MS) {
            dailyEntry.count.set(0);
            dailyEntry.windowStart.set(currentTime);
        }

        if (dailyEntry.count.incrementAndGet() > dailyLimit) {
            logger.warn("Daily AI rate limit exceeded for key: {}", rateLimitKey);
            sendRateLimitResponse(httpResponse, "daily", dailyEntry.windowStart.get() + DAY_MS,
                    isAuthenticated ? "authenticated" : "unauthenticated");
            return;
        }

        // Clean up old entries periodically
        if (hourlyLimits.size() > 1000) {
            cleanupOldEntries(currentTime);
        }

        chain.doFilter(request, response);
    }

    /**
     * Send rate limit exceeded response with JSON body
     */
    private void sendRateLimitResponse(HttpServletResponse response, String limitType,
                                      long resetTimeMs, String tier) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");

        LocalDateTime resetTime = LocalDateTime.ofEpochSecond(
                resetTimeMs / 1000, 0, ZoneOffset.UTC);

        Map<String, Object> errorResponse = Map.of(
                "error", "Rate limit exceeded",
                "limitType", limitType,
                "resetTime", resetTime.format(DateTimeFormatter.ISO_DATE_TIME),
                "tier", tier
        );

        objectMapper.writeValue(response.getWriter(), errorResponse);
    }

    /**
     * Clean up expired entries from rate limit maps
     */
    private void cleanupOldEntries(long currentTime) {
        hourlyLimits.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > HOUR_MS * 2);

        dailyLimits.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > DAY_MS * 2);

        logger.debug("Cleaned up AI rate limit entries. Hourly: {}, Daily: {}",
                hourlyLimits.size(), dailyLimits.size());
    }

    /**
     * Extract client IP address from request
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Rate limit entry holder
     */
    private static class RateLimitEntry {
        final AtomicInteger count = new AtomicInteger(0);
        final AtomicLong windowStart;

        RateLimitEntry(long windowStart) {
            this.windowStart = new AtomicLong(windowStart);
        }
    }
}
