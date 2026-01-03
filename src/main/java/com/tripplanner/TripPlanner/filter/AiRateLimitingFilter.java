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
 * Rate Limit Strategy - Beta Testing Phase:
 * ==========================================
 * API Backend: GPT-4o-mini-nano via n8n (10k RPD, 500 RPM, 200k TPM)
 * Effective bottleneck: 200k TPM ÷ 2.5k tokens/req ≈ 80 requests/minute maximum
 *
 * Access Model: Route Planner available ONLY to authenticated beta testers (admin-approved)
 * Current users: 7 beta testers
 * Expected concurrent active users: 2-4 (rarely all 7 simultaneously)
 *
 * Beta Tester Limits (Aggressive - Optimized for Testing):
 *   - 20 req/min   (rapid testing bursts, 1 request every 3 seconds)
 *   - 400 req/hour (sustained 6.6 req/min, very generous for testing sessions)
 *   - 1500 req/day (extensive daily testing, planning multiple complex trips)
 *
 * Safety Analysis:
 *   Target usage: 70% of 200k TPM = 140k TPM = 56 req/min safe threshold
 *   Typical load: 3 users × 20 RPM = 60 RPM × 2.5k tokens = 150k TPM (75% of limit) ✓
 *   Worst case: 7 users × 20 RPM = 140 RPM (would exceed limit, but statistically unlikely)
 *
 * Future Scaling: When user base grows to 50-100 users, reduce to:
 *   - 10 req/min, 150 req/hour, 500 req/day
 *
 * Unauthenticated tier exists for API consistency but users can't access /api/ai/** without auth.
 *
 * @see application.properties for configuration
 */
public class AiRateLimitingFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(AiRateLimitingFilter.class);

    // Beta Tester Rate Limits (configurable via application.properties)
    @Value("${ai.ratelimit.authenticated.minute:20}")
    private int authMinuteLimit;

    @Value("${ai.ratelimit.authenticated.hourly:400}")
    private int authHourlyLimit;

    @Value("${ai.ratelimit.authenticated.daily:1500}")
    private int authDailyLimit;

    // Unauthenticated limits (kept for completeness, but /api/ai/** requires auth)
    @Value("${ai.ratelimit.unauthenticated.minute:3}")
    private int unauthMinuteLimit;

    @Value("${ai.ratelimit.unauthenticated.hourly:10}")
    private int unauthHourlyLimit;

    @Value("${ai.ratelimit.unauthenticated.daily:30}")
    private int unauthDailyLimit;

    // Premium tier (future use - admin override)
    @Value("${ai.ratelimit.premium.minute:30}")
    private int premiumMinuteLimit;

    @Value("${ai.ratelimit.premium.hourly:600}")
    private int premiumHourlyLimit;

    @Value("${ai.ratelimit.premium.daily:2000}")
    private int premiumDailyLimit;

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Time windows
    private static final long MINUTE_MS = 60 * 1000;
    private static final long HOUR_MS = 60 * 60 * 1000;
    private static final long DAY_MS = 24 * 60 * 60 * 1000;

    // Rate limit tracking maps (one per time window)
    private final ConcurrentHashMap<String, RateLimitEntry> minuteLimits = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RateLimitEntry> hourlyLimits = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RateLimitEntry> dailyLimits = new ConcurrentHashMap<>();

    // Aggregate usage tracking for monitoring
    private final AtomicLong totalRequests = new AtomicLong(0);
    private final AtomicLong totalRejections = new AtomicLong(0);
    private final ConcurrentHashMap<String, AtomicInteger> activeUsers = new ConcurrentHashMap<>();
    private volatile long lastLogTime = System.currentTimeMillis();

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
        int minuteLimit;
        int hourlyLimit;
        int dailyLimit;
        String tierName;

        if (isAuthenticated) {
            // Use user ID as rate limit key
            try {
                OAuth2User oAuth2User = (OAuth2User) auth.getPrincipal();
                userEmail = oAuth2User.getAttribute("email");

                if (userEmail != null) {
                    var userOpt = userRepository.findByEmail(userEmail);
                    if (userOpt.isPresent()) {
                        User user = userOpt.get();
                        userId = user.getId();
                        rateLimitKey = "user:" + userId;

                        // Check if user has premium/admin role (future feature)
                        // For now, all authenticated users get standard beta tester limits
                        tierName = "beta-tester";
                        minuteLimit = authMinuteLimit;
                        hourlyLimit = authHourlyLimit;
                        dailyLimit = authDailyLimit;

                        // Track active user
                        activeUsers.computeIfAbsent(rateLimitKey, k -> new AtomicInteger(0)).set(1);
                    } else {
                        rateLimitKey = "email:" + userEmail;
                        tierName = "authenticated";
                        minuteLimit = authMinuteLimit;
                        hourlyLimit = authHourlyLimit;
                        dailyLimit = authDailyLimit;
                    }
                } else {
                    rateLimitKey = "auth:unknown";
                    tierName = "authenticated";
                    minuteLimit = authMinuteLimit;
                    hourlyLimit = authHourlyLimit;
                    dailyLimit = authDailyLimit;
                }

            } catch (Exception e) {
                logger.warn("Failed to extract user from authentication, treating as unauthenticated", e);
                rateLimitKey = "ip:" + getClientIp(httpRequest);
                tierName = "unauthenticated";
                minuteLimit = unauthMinuteLimit;
                hourlyLimit = unauthHourlyLimit;
                dailyLimit = unauthDailyLimit;
                isAuthenticated = false;
            }
        } else {
            // Use IP address as rate limit key
            rateLimitKey = "ip:" + getClientIp(httpRequest);
            tierName = "unauthenticated";
            minuteLimit = unauthMinuteLimit;
            hourlyLimit = unauthHourlyLimit;
            dailyLimit = unauthDailyLimit;
        }

        long currentTime = System.currentTimeMillis();

        // Increment total request counter
        totalRequests.incrementAndGet();

        // Check per-minute limit (NEW - prevents burst abuse)
        RateLimitEntry minuteEntry = minuteLimits.computeIfAbsent(rateLimitKey,
                k -> new RateLimitEntry(currentTime));

        if (currentTime - minuteEntry.windowStart.get() > MINUTE_MS) {
            minuteEntry.count.set(0);
            minuteEntry.windowStart.set(currentTime);
        }

        if (minuteEntry.count.incrementAndGet() > minuteLimit) {
            totalRejections.incrementAndGet();
            logger.warn("Per-minute AI rate limit exceeded for {} (tier: {}, limit: {}/min)",
                    rateLimitKey, tierName, minuteLimit);
            sendRateLimitResponse(httpResponse, "per-minute", minuteEntry.windowStart.get() + MINUTE_MS,
                    tierName, minuteLimit, hourlyLimit, dailyLimit);
            return;
        }

        // Check hourly limit
        RateLimitEntry hourlyEntry = hourlyLimits.computeIfAbsent(rateLimitKey,
                k -> new RateLimitEntry(currentTime));

        if (currentTime - hourlyEntry.windowStart.get() > HOUR_MS) {
            hourlyEntry.count.set(0);
            hourlyEntry.windowStart.set(currentTime);
        }

        if (hourlyEntry.count.incrementAndGet() > hourlyLimit) {
            totalRejections.incrementAndGet();
            logger.warn("Hourly AI rate limit exceeded for {} (tier: {}, limit: {}/hour)",
                    rateLimitKey, tierName, hourlyLimit);
            sendRateLimitResponse(httpResponse, "hourly", hourlyEntry.windowStart.get() + HOUR_MS,
                    tierName, minuteLimit, hourlyLimit, dailyLimit);
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
            totalRejections.incrementAndGet();
            logger.warn("Daily AI rate limit exceeded for {} (tier: {}, limit: {}/day)",
                    rateLimitKey, tierName, dailyLimit);
            sendRateLimitResponse(httpResponse, "daily", dailyEntry.windowStart.get() + DAY_MS,
                    tierName, minuteLimit, hourlyLimit, dailyLimit);
            return;
        }

        // Log aggregate usage statistics every hour
        if (currentTime - lastLogTime > HOUR_MS) {
            logUsageStatistics(currentTime);
            lastLogTime = currentTime;
        }

        // Clean up old entries periodically
        if (minuteLimits.size() + hourlyLimits.size() + dailyLimits.size() > 3000) {
            cleanupOldEntries(currentTime);
        }

        chain.doFilter(request, response);
    }

    /**
     * Send rate limit exceeded response with JSON body
     * Includes detailed information for debugging and user feedback
     */
    private void sendRateLimitResponse(HttpServletResponse response, String limitType,
                                      long resetTimeMs, String tier,
                                      int minuteLimit, int hourlyLimit, int dailyLimit) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");

        LocalDateTime resetTime = LocalDateTime.ofEpochSecond(
                resetTimeMs / 1000, 0, ZoneOffset.UTC);

        Map<String, Object> limits = Map.of(
                "perMinute", minuteLimit,
                "perHour", hourlyLimit,
                "perDay", dailyLimit
        );

        Map<String, Object> errorResponse = Map.of(
                "error", "Rate limit exceeded",
                "message", "You have exceeded the " + limitType + " rate limit for AI features.",
                "limitType", limitType,
                "resetTime", resetTime.format(DateTimeFormatter.ISO_DATE_TIME),
                "tier", tier,
                "limits", limits
        );

        objectMapper.writeValue(response.getWriter(), errorResponse);
    }

    /**
     * Log aggregate usage statistics for monitoring
     * Called every hour to track overall system health
     */
    private void logUsageStatistics(long currentTime) {
        long total = totalRequests.get();
        long rejections = totalRejections.get();
        int uniqueUsers = activeUsers.size();
        double rejectionRate = total > 0 ? (rejections * 100.0 / total) : 0;

        logger.info("AI Rate Limit Stats (past hour): Total requests: {}, Rejections: {} ({:.2f}%), " +
                        "Unique users: {}, Minute/Hour/Daily entries: {}/{}/{}",
                total, rejections, rejectionRate, uniqueUsers,
                minuteLimits.size(), hourlyLimits.size(), dailyLimits.size());

        // Reset counters for next hour
        totalRequests.set(0);
        totalRejections.set(0);
        activeUsers.clear();
    }

    /**
     * Clean up expired entries from rate limit maps
     * Prevents memory leaks from accumulating old tracking data
     */
    private void cleanupOldEntries(long currentTime) {
        int beforeMinute = minuteLimits.size();
        int beforeHourly = hourlyLimits.size();
        int beforeDaily = dailyLimits.size();

        minuteLimits.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > MINUTE_MS * 2);

        hourlyLimits.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > HOUR_MS * 2);

        dailyLimits.entrySet().removeIf(entry ->
                currentTime - entry.getValue().windowStart.get() > DAY_MS * 2);

        logger.debug("Cleaned up AI rate limit entries. Minute: {} -> {}, Hourly: {} -> {}, Daily: {} -> {}",
                beforeMinute, minuteLimits.size(),
                beforeHourly, hourlyLimits.size(),
                beforeDaily, dailyLimits.size());
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
