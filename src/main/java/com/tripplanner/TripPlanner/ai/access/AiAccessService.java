package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Core access-control service for all /api/ai/** endpoints.
 *
 * Responsibilities (executed in order per CLAUDE.md rule 3):
 *  1. Bucket4j rate limit check — user bucket (60/min), IP bucket (120/min)
 *  2. Redis-cached Supabase grant check (60s positive TTL, 10s negative TTL)
 *  3. Redis usage cap check (daily USD, monthly USD, monthly tokens, monthly requests)
 *
 * Rate-limit buckets: In-memory Bucket4j (ConcurrentHashMap keyed by userId/IP).
 * This is intentional for M1 — a single-instance deployment. The TODO below
 * marks the upgrade path to Redis-backed Bucket4j for M2/M3 multi-instance deploys.
 *
 * Grant cache: Redis key {@code ai:grant:{userId}}, serialised as JSON.
 * Usage counters: delegated to {@link RedisUsageCounters} (extracted in M2).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiAccessService {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    private static final String GRANT_KEY_PREFIX  = "ai:grant:";
    private static final long   GRANT_TTL_POS_SEC = 60L;   // positive cache TTL
    private static final long   GRANT_TTL_NEG_SEC = 10L;   // negative cache TTL

    // Bucket4j limits (per CLAUDE.md rule 4)
    private static final int USER_RATE_PER_MIN = 60;
    private static final int IP_RATE_PER_MIN   = 120;

    // -------------------------------------------------------------------------
    // Dependencies
    // -------------------------------------------------------------------------

    private final RedisTemplate<String, String> redisTemplate;
    private final SupabaseClient supabaseClient;
    private final ObjectMapper objectMapper;
    private final RedisUsageCounters usageCounters;

    // -------------------------------------------------------------------------
    // In-memory Bucket4j state
    // TODO M2: replace with Redis-backed Bucket4j (bucket4j-redis + Lettuce) so
    //          rate limits survive restarts and work across multiple app instances.
    // -------------------------------------------------------------------------

    private final ConcurrentHashMap<String, Bucket> userBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> ipBuckets   = new ConcurrentHashMap<>();

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Runs the full access check pipeline for a given user + IP pair.
     *
     * @param userId   the authenticated user's Google sub claim
     * @param clientIp the remote IP address (after proxy resolution)
     * @return AccessResult indicating whether the request should proceed
     */
    public AccessResult check(String userId, String clientIp) {
        // Step 1 — rate limiting (both buckets must pass)
        if (!consumeUserBucket(userId)) {
            log.debug("User rate limit exceeded for userId [{}]", userId);
            return AccessResult.RATE_LIMITED;
        }
        if (!consumeIpBucket(clientIp)) {
            log.debug("IP rate limit exceeded for ip [{}]", clientIp);
            return AccessResult.RATE_LIMITED;
        }

        // Step 2 — grant check (Redis-cached, Supabase fallback)
        GrantCacheEntry grant = resolveGrant(userId);
        if (grant == null || !grant.isGranted()) {
            log.debug("No valid grant for userId [{}]", userId);
            return AccessResult.NO_GRANT;
        }

        // Step 3 — usage cap check
        if (isOverCap(userId, grant)) {
            log.debug("Usage cap exceeded for userId [{}]", userId);
            return AccessResult.OVER_CAP;
        }

        return AccessResult.GRANTED;
    }

    /**
     * Returns the cached/resolved grant for the given user, if one exists and is enabled.
     *
     * Used by AgentController (M5) to read the user's per-call USD caps so they can
     * be embedded in the internal JWT issued to the langgraph-agent service. The
     * BudgetGuardMiddleware on the Python side reads these caps from the JWT instead
     * of round-tripping to Supabase.
     *
     * Hits the same cache path as {@link #check(String, String)} — no extra Supabase
     * load when called immediately after a successful access check.
     *
     * @param userId the authenticated user's Google sub claim
     * @return Optional containing the grant if present and enabled, empty otherwise
     */
    public Optional<GrantCacheEntry> getCachedGrant(String userId) {
        GrantCacheEntry grant = resolveGrant(userId);
        return Optional.ofNullable(grant);
    }

    /**
     * Records usage increments in Redis (via {@link RedisUsageCounters}) and
     * asynchronously posts to Supabase's increment_ai_usage RPC.
     *
     * Fire-and-forget: errors are logged at WARN but never propagate to the caller.
     * Called by AgentController on stream completion (M3 wires the doOnComplete).
     *
     * @param userId   the authenticated user's Google sub claim
     * @param tokens   number of LLM tokens consumed
     * @param costUsd  estimated cost in USD for this call
     */
    public void recordUsage(String userId, int tokens, double costUsd) {
        try {
            usageCounters.increment(userId, tokens, costUsd);
        } catch (Exception e) {
            // userId not logged at WARN — Blocker 5 PII constraint
            log.warn("Failed to record Redis usage: {}", e.getMessage());
        }

        // Async Supabase flush — swallow errors
        supabaseClient.incrementUsage(userId, tokens, costUsd)
                .subscribe(
                        ignored -> {},
                        err -> log.warn("Async Supabase increment_ai_usage failed: {}", err.getMessage())
                );
    }

    // -------------------------------------------------------------------------
    // Grant resolution
    // -------------------------------------------------------------------------

    private GrantCacheEntry resolveGrant(String userId) {
        String key = GRANT_KEY_PREFIX + userId;
        try {
            String cached = redisTemplate.opsForValue().get(key);
            if (cached != null) {
                log.debug("Grant cache HIT for userId [{}]", userId);
                GrantCacheEntry entry = objectMapper.readValue(cached, GrantCacheEntry.class);
                // NO_GRANT sentinel stored under negative TTL — treat as no grant
                return entry.isNoGrant() ? null : entry;
            }
        } catch (Exception e) {
            // userId not logged at WARN — Blocker 5 PII constraint
            log.warn("Failed to read grant cache: {}", e.getMessage());
        }

        // Cache miss — synchronous Supabase lookup
        log.debug("Grant cache MISS for userId [{}], querying Supabase", userId);
        Optional<GrantCacheEntry> supabaseResult = supabaseClient.fetchGrant(userId).block();

        if (supabaseResult == null || supabaseResult.isEmpty()) {
            // No row in Supabase — cache the negative result with short TTL
            cacheGrant(key, GrantCacheEntry.NO_GRANT, GRANT_TTL_NEG_SEC);
            log.debug("No grant row in Supabase for userId [{}]", userId);
            return null;
        }

        GrantCacheEntry entry = supabaseResult.get();
        long ttl = entry.isGranted() ? GRANT_TTL_POS_SEC : GRANT_TTL_NEG_SEC;
        cacheGrant(key, entry, ttl);

        return entry.isGranted() ? entry : null;
    }

    private void cacheGrant(String key, GrantCacheEntry entry, long ttlSeconds) {
        try {
            String json = objectMapper.writeValueAsString(entry);
            redisTemplate.opsForValue().set(key, json, ttlSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            // key contains userId prefix — not logged at WARN per Blocker 5 PII constraint
            log.warn("Failed to cache grant entry: {}", e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Usage cap check — reads current counters from RedisUsageCounters
    // -------------------------------------------------------------------------

    private boolean isOverCap(String userId, GrantCacheEntry grant) {
        // Daily USD cap — BigDecimal comparison avoids floating-point drift
        if (grant.dailyUsdCap().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal dailyUsd = usageCounters.getDailyUsdBigDecimal(userId);
            if (dailyUsd.compareTo(grant.dailyUsdCap()) >= 0) {
                log.debug("Daily USD cap reached");
                return true;
            }
        }

        // Monthly USD cap — BigDecimal comparison avoids floating-point drift
        if (grant.monthlyUsdCap().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal monthlyUsd = usageCounters.getMonthlyUsdBigDecimal(userId);
            if (monthlyUsd.compareTo(grant.monthlyUsdCap()) >= 0) {
                log.debug("Monthly USD cap reached");
                return true;
            }
        }

        // Monthly token cap
        if (grant.monthlyTokenCap() > 0) {
            long tokens = usageCounters.getMonthlyTokensRaw(userId);
            if (tokens >= grant.monthlyTokenCap()) {
                log.debug("Monthly token cap reached");
                return true;
            }
        }

        // Monthly request cap
        if (grant.monthlyReqCap() > 0) {
            long reqs = usageCounters.getMonthlyRequestsRaw(userId);
            if (reqs >= grant.monthlyReqCap()) {
                log.debug("Monthly req cap reached");
                return true;
            }
        }

        return false;
    }

    // -------------------------------------------------------------------------
    // Bucket4j helpers (in-memory, per CLAUDE.md M1 scope)
    // -------------------------------------------------------------------------

    private boolean consumeUserBucket(String userId) {
        Bucket bucket = userBuckets.computeIfAbsent(userId, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(USER_RATE_PER_MIN)
                                .refillGreedy(USER_RATE_PER_MIN, Duration.ofMinutes(1))
                                .build())
                        .build());
        return bucket.tryConsume(1);
    }

    private boolean consumeIpBucket(String clientIp) {
        Bucket bucket = ipBuckets.computeIfAbsent(clientIp, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(IP_RATE_PER_MIN)
                                .refillGreedy(IP_RATE_PER_MIN, Duration.ofMinutes(1))
                                .build())
                        .build());
        return bucket.tryConsume(1);
    }
}
