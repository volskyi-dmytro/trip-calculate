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
import com.tripplanner.TripPlanner.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
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

    // Testers/trusted users (internal user ids, never emails) get a larger
    // per-user allowance; the global caps still apply to them.
    @Value("${ai.ratelimit.trusted-user-ids:}")
    private String trustedUserIdsConfig;

    @Value("${ai.ratelimit.trusted.minute:10}")
    private int trustedMinuteLimit;

    @Value("${ai.ratelimit.trusted.hourly:100}")
    private int trustedHourlyLimit;

    @Value("${ai.ratelimit.trusted.daily:200}")
    private int trustedDailyLimit;

    // Field-injected like the @Value settings above: this filter is created with
    // `new` in SecurityConfig and wired as a bean. Only consulted when a trusted
    // allowlist is configured.
    @Autowired(required = false)
    private UserRepository userRepository;

    /**
     * Request attribute holding a Runnable that gives this request's reserved
     * quota back. Controllers run it when the request failed on our side
     * (agent down, 5xx, broken stream), so errors never cost the user quota.
     */
    public static final String REFUND_ATTRIBUTE = AiRateLimitingFilter.class.getName() + ".refund";

    /** Returns the reserved quota of this request, at most once; no-op when none. */
    public static void refund(ServletRequest request) {
        if (request.getAttribute(REFUND_ATTRIBUTE) instanceof Runnable refund) {
            refund.run();
        }
    }

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

        String email;
        String subject;
        boolean emailVerified;

        Object principal = authentication.getPrincipal();
        if (principal instanceof OidcUser oidcUser) {
            email = oidcUser.getEmail();
            emailVerified = Boolean.TRUE.equals(oidcUser.getEmailVerified());
            subject = oidcUser.getSubject();
        } else if (authentication instanceof OAuth2AuthenticationToken oauth2Token
                && "google".equals(oauth2Token.getAuthorizedClientRegistrationId())
                && principal instanceof OAuth2User oauth2User) {
            // Spring Session JDBC can restore Google's DefaultOidcUser as a
            // DefaultOAuth2User after a restart. The signed-in Google registration
            // and the persisted verified claims still establish the same identity.
            Object emailClaim = oauth2User.getAttribute("email");
            email = emailClaim instanceof String value ? value : null;
            emailVerified = Boolean.TRUE.equals(oauth2User.getAttribute("email_verified"));
            Object subjectClaim = oauth2User.getAttribute("sub");
            subject = subjectClaim instanceof String value ? value : null;
        } else {
            rejectUnauthorized(httpResponse, "Google OIDC authentication is required.");
            return;
        }

        if (email == null || email.isBlank() || !emailVerified) {
            rejectUnauthorized(httpResponse, "A verified Google email is required.");
            return;
        }

        if (subject == null || subject.isBlank()) {
            rejectUnauthorized(httpResponse, "A valid Google identity is required.");
            return;
        }

        String rateLimitKey = "oidc:" + subject;
        boolean trusted = isTrusted(email);
        String tierName = trusted ? "trusted" : "public-beta";
        int[] userLimitsForTier = trusted
                ? new int[] {trustedMinuteLimit, trustedHourlyLimit, trustedDailyLimit}
                : new int[] {authMinuteLimit, authHourlyLimit, authDailyLimit};
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
            sendRejectionResponse(httpResponse, cooldown, tierName, userLimitsForTier);
            return;
        }

        totalRequests.incrementAndGet();
        LimitRejection rejection = reserveAtomically(rateLimitKey, currentTime, userLimitsForTier);
        if (rejection != null) {
            totalRejections.incrementAndGet();
            logRejectionSampled(rejection, currentTime);
            sendRejectionResponse(httpResponse, rejection, tierName, userLimitsForTier);
            return;
        }
        Runnable refund = refundFor(rateLimitKey, currentTime);
        httpRequest.setAttribute(REFUND_ATTRIBUTE, refund);

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
        // Synchronous failures refund here; async (SSE) failures are refunded by
        // the controller once the stream's outcome is known.
        if (!httpRequest.isAsyncStarted() && httpResponse.getStatus() >= 500) {
            refund.run();
        }
    }

    private boolean isTrusted(String email) {
        Set<Long> trustedIds = trustedUserIds();
        if (trustedIds.isEmpty() || userRepository == null) {
            return false;
        }
        return userRepository.findByEmail(email)
                .map(user -> trustedIds.contains(user.getId()))
                .orElse(false);
    }

    private Set<Long> trustedUserIds() {
        if (trustedUserIdsConfig == null || trustedUserIdsConfig.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(trustedUserIdsConfig.split(","))
                .map(String::trim)
                .filter(id -> id.matches("\\d+"))
                .map(Long::valueOf)
                .collect(Collectors.toSet());
    }

    /**
     * Undoes one reservation in every window it was counted in, unless that
     * window has since rolled over (then the slot is already free).
     */
    private Runnable refundFor(String rateLimitKey, long reservedAt) {
        AtomicBoolean done = new AtomicBoolean();
        return () -> {
            if (!done.compareAndSet(false, true)) {
                return;
            }
            synchronized (globalLock) {
                RateLimitBucket user = userLimits.get(rateLimitKey);
                if (user != null) {
                    release(user, reservedAt);
                }
                release(globalBucket(), reservedAt);
            }
        };
    }

    private void release(RateLimitBucket bucket, long reservedAt) {
        for (RateLimitEntry entry : new RateLimitEntry[] {bucket.minute, bucket.hourly, bucket.daily}) {
            if (entry.windowStart.get() <= reservedAt) {
                entry.count.updateAndGet(c -> Math.max(0, c - 1));
            }
        }
        bucket.cooldown = null;
    }

    private LimitRejection reserveAtomically(String rateLimitKey, long now, int[] userLimitsForTier) {
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
                    userLimitsForTier[0], userLimitsForTier[1], userLimitsForTier[2]);
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
                                       String userTier, int[] userLimitsForTier) throws IOException {
        sendRateLimitResponse(response, rejection.scope(), rejection.resetAt(),
                rejection.global() ? "public-beta-global" : userTier,
                rejection.global() ? globalMinuteLimit : userLimitsForTier[0],
                rejection.global() ? globalHourlyLimit : userLimitsForTier[1],
                rejection.global() ? globalDailyLimit : userLimitsForTier[2]);
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
