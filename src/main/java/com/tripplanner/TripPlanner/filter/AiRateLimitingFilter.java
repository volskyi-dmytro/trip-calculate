package com.tripplanner.TripPlanner.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * AI-specific rate limiter for Google-authenticated public-beta users.
 * Applies only to /api/ai/** endpoints.
 *
 * <p>User and process-wide windows are checked and reserved atomically. A
 * rejected request therefore consumes no quota in any other window.</p>
 */
public class AiRateLimitingFilter implements Filter {

    private static final Logger logger = LoggerFactory.getLogger(AiRateLimitingFilter.class);
    private static final long MINUTE_MS = 60 * 1000;
    private static final long HOUR_MS = 60 * 60 * 1000;
    private static final long DAY_MS = 24 * 60 * 60 * 1000;
    private static final long REJECTION_LOG_INTERVAL_MS = 10 * 1000;

    @Value("${ai.ratelimit.authenticated.minute:3}")
    private int authMinuteLimit;

    @Value("${ai.ratelimit.authenticated.hourly:20}")
    private int authHourlyLimit;

    @Value("${ai.ratelimit.authenticated.daily:10}")
    private int authDailyLimit;

    @Value("${ai.ratelimit.global.minute:30}")
    private int globalMinuteLimit;

    @Value("${ai.ratelimit.global.hourly:200}")
    private int globalHourlyLimit;

    @Value("${ai.ratelimit.global.daily:500}")
    private int globalDailyLimit;

    @Value("${ai.ratelimit.max-identities:1000}")
    private int maxUserBuckets;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ConcurrentHashMap<String, RateLimitBucket> userLimits = new ConcurrentHashMap<>();
    private final Object globalLock = new Object();
    private final RateLimitEntry globalMinute = new RateLimitEntry(System.currentTimeMillis());
    private final RateLimitEntry globalHourly = new RateLimitEntry(System.currentTimeMillis());
    private final RateLimitEntry globalDaily = new RateLimitEntry(System.currentTimeMillis());

    private final AtomicLong totalRequests = new AtomicLong();
    private final AtomicLong totalRejections = new AtomicLong();
    private final AtomicLong lastRejectionLogTime = new AtomicLong();
    private final AtomicReference<LimitRejection> globalCooldown = new AtomicReference<>();
    private final AtomicReference<LimitRejection> capacityCooldown = new AtomicReference<>();
    private final ConcurrentHashMap<String, Boolean> activeUsers = new ConcurrentHashMap<>();
    private volatile long lastLogTime = System.currentTimeMillis();
    private volatile long lastCleanupTime = System.currentTimeMillis();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        if (!httpRequest.getRequestURI().startsWith("/api/ai/")) {
            chain.doFilter(request, response);
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            rejectUnauthorized(httpResponse, "Google OIDC authentication is required.");
            return;
        }

        if (!(authentication.getPrincipal() instanceof OidcUser oidcUser)) {
            rejectUnauthorized(httpResponse, "Google OIDC authentication is required.");
            return;
        }

        String email = oidcUser.getEmail();
        if (email == null || email.isBlank() || !Boolean.TRUE.equals(oidcUser.getEmailVerified())) {
            rejectUnauthorized(httpResponse, "A verified Google email is required.");
            return;
        }

        String subject = oidcUser.getSubject();
        if (subject == null || subject.isBlank()) {
            rejectUnauthorized(httpResponse, "A valid Google identity is required.");
            return;
        }

        String rateLimitKey = "oidc:" + subject;
        String tierName = "public-beta";
        long currentTime = System.currentTimeMillis();

        LimitRejection cooldown = activeCooldown(globalCooldown.get(), currentTime);
        if (cooldown == null) {
            RateLimitBucket existing = userLimits.get(rateLimitKey);
            cooldown = existing == null ? null : activeCooldown(existing.cooldown, currentTime);
            if (cooldown == null && existing == null) {
                cooldown = activeCooldown(capacityCooldown.get(), currentTime);
            }
        }
        if (cooldown != null) {
            sendRejectionResponse(httpResponse, cooldown, tierName);
            return;
        }

        totalRequests.incrementAndGet();
        LimitRejection rejection = reserveAtomically(rateLimitKey, currentTime);
        if (rejection != null) {
            totalRejections.incrementAndGet();
            logRejectionSampled(rejection, currentTime);
            sendRejectionResponse(httpResponse, rejection, tierName);
            return;
        }

        activeUsers.put(rateLimitKey, Boolean.TRUE);
        if (currentTime - lastLogTime > HOUR_MS) {
            logUsageStatistics();
            lastLogTime = currentTime;
        }
        if (userLimits.size() > maxUserBuckets / 2
                && currentTime - lastCleanupTime >= HOUR_MS) {
            cleanupOldEntries(currentTime);
        }

        chain.doFilter(request, response);
    }

    private LimitRejection reserveAtomically(String rateLimitKey, long now) {
        synchronized (globalLock) {
            RateLimitBucket global = globalBucket();
            resetBucket(global, now);
            LimitRejection rejection = firstExceeded(global, now, true,
                    globalMinuteLimit, globalHourlyLimit, globalDailyLimit);
            if (rejection != null) {
                globalCooldown.set(rejection);
                return rejection;
            }

            RateLimitBucket user = userLimits.get(rateLimitKey);
            if (user == null) {
                if (userLimits.size() >= maxUserBuckets) {
                    cleanupOldEntriesLocked(now);
                }
                if (userLimits.size() >= maxUserBuckets) {
                    LimitRejection capacityRejection = new LimitRejection("identity-capacity",
                            now + MINUTE_MS, maxUserBuckets, true);
                    capacityCooldown.set(capacityRejection);
                    return capacityRejection;
                }
                user = new RateLimitBucket(now);
                userLimits.put(rateLimitKey, user);
            }

            resetBucket(user, now);
            rejection = firstExceeded(user, now, false,
                    authMinuteLimit, authHourlyLimit, authDailyLimit);
            if (rejection != null) {
                user.cooldown = rejection;
                return rejection;
            }

            increment(user);
            increment(global);
            return null;
        }
    }

    private void resetBucket(RateLimitBucket bucket, long now) {
        resetExpired(bucket.minute, now, MINUTE_MS);
        resetExpired(bucket.hourly, now, HOUR_MS);
        resetExpired(bucket.daily, now, DAY_MS);
    }

    private LimitRejection firstExceeded(RateLimitBucket bucket, long now, boolean global,
                                         int minuteLimit, int hourlyLimit, int dailyLimit) {
        if (bucket.minute.count.get() >= minuteLimit) {
            return new LimitRejection(prefix(global, "per-minute"),
                    bucket.minute.windowStart.get() + MINUTE_MS, minuteLimit, global);
        }
        if (bucket.hourly.count.get() >= hourlyLimit) {
            return new LimitRejection(prefix(global, "hourly"),
                    bucket.hourly.windowStart.get() + HOUR_MS, hourlyLimit, global);
        }
        if (bucket.daily.count.get() >= dailyLimit) {
            return new LimitRejection(prefix(global, "daily"),
                    bucket.daily.windowStart.get() + DAY_MS, dailyLimit, global);
        }
        return null;
    }

    private String prefix(boolean global, String scope) {
        return global ? "global-" + scope : scope;
    }

    private LimitRejection activeCooldown(LimitRejection cooldown, long now) {
        return cooldown != null && now < cooldown.resetAt() ? cooldown : null;
    }

    private void logRejectionSampled(LimitRejection rejection, long now) {
        long previous = lastRejectionLogTime.get();
        if (now - previous >= REJECTION_LOG_INTERVAL_MS
                && lastRejectionLogTime.compareAndSet(previous, now)) {
            logger.warn("AI rate limit exceeded: scope={}, limit={}",
                    rejection.scope(), rejection.limit());
        }
    }

    private void sendRejectionResponse(HttpServletResponse response, LimitRejection rejection,
                                       String userTier) throws IOException {
        sendRateLimitResponse(response, rejection.scope(), rejection.resetAt(),
                rejection.global() ? "public-beta-global" : userTier,
                rejection.global() ? globalMinuteLimit : authMinuteLimit,
                rejection.global() ? globalHourlyLimit : authHourlyLimit,
                rejection.global() ? globalDailyLimit : authDailyLimit);
    }

    private RateLimitBucket globalBucket() {
        return new RateLimitBucket(globalMinute, globalHourly, globalDaily);
    }

    private void increment(RateLimitBucket bucket) {
        bucket.minute.count.incrementAndGet();
        bucket.hourly.count.incrementAndGet();
        bucket.daily.count.incrementAndGet();
    }

    private void resetExpired(RateLimitEntry entry, long now, long windowMs) {
        if (now - entry.windowStart.get() >= windowMs) {
            entry.count.set(0);
            entry.windowStart.set(now);
        }
    }

    private void rejectUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "error", "Unauthorized",
                "message", message
        ));
    }

    private void sendRateLimitResponse(HttpServletResponse response, String limitType,
                                       long resetTimeMs, String tier,
                                       int minuteLimit, int hourlyLimit, int dailyLimit) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");
        long retryAfterSeconds = Math.max(1, (resetTimeMs - System.currentTimeMillis() + 999) / 1000);
        response.setHeader("Retry-After", Long.toString(retryAfterSeconds));

        LocalDateTime resetTime = LocalDateTime.ofEpochSecond(resetTimeMs / 1000, 0, ZoneOffset.UTC);
        objectMapper.writeValue(response.getWriter(), Map.of(
                "error", "Rate limit exceeded",
                "message", "You have exceeded the " + limitType + " rate limit for AI features.",
                "limitType", limitType,
                "resetTime", resetTime.format(DateTimeFormatter.ISO_DATE_TIME),
                "tier", tier,
                "limits", Map.of(
                        "perMinute", minuteLimit,
                        "perHour", hourlyLimit,
                        "perDay", dailyLimit)
        ));
    }

    private void logUsageStatistics() {
        long total = totalRequests.getAndSet(0);
        long rejections = totalRejections.getAndSet(0);
        double rejectionRate = total > 0 ? rejections * 100.0 / total : 0;
        logger.info("AI rate-limit stats: requests={}, rejections={} ({}%), uniqueUsers={}",
                total, rejections, String.format("%.2f", rejectionRate), activeUsers.size());
        activeUsers.clear();
    }

    private void cleanupOldEntries(long now) {
        synchronized (globalLock) {
            cleanupOldEntriesLocked(now);
        }
    }

    private void cleanupOldEntriesLocked(long now) {
        if (now - lastCleanupTime < MINUTE_MS) {
            return;
        }
        userLimits.entrySet().removeIf(entry ->
                now - entry.getValue().daily.windowStart.get() > DAY_MS * 2);
        lastCleanupTime = now;
    }

    private record LimitRejection(String scope, long resetAt, int limit, boolean global) {
    }

    private static class RateLimitBucket {
        final RateLimitEntry minute;
        final RateLimitEntry hourly;
        final RateLimitEntry daily;
        volatile LimitRejection cooldown;

        RateLimitBucket(long now) {
            this(new RateLimitEntry(now), new RateLimitEntry(now), new RateLimitEntry(now));
        }

        RateLimitBucket(RateLimitEntry minute, RateLimitEntry hourly, RateLimitEntry daily) {
            this.minute = minute;
            this.hourly = hourly;
            this.daily = daily;
        }
    }

    private static class RateLimitEntry {
        final AtomicInteger count = new AtomicInteger();
        final AtomicLong windowStart;

        RateLimitEntry(long windowStart) {
            this.windowStart = new AtomicLong(windowStart);
        }
    }
}
