package com.tripplanner.TripPlanner.ai.access;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

/**
 * Redis-backed usage counters for the AI access layer.
 *
 * Extracted from AiAccessService (M2 refactor) to keep that class under the
 * 300-line "no god service" threshold from CLAUDE.md §Code Conventions.
 *
 * Key scheme:
 *  - Daily USD:    {@code ai:usage:{userId}:day:{YYYY-MM-DD}:usd}   — TTL 48h rolling
 *  - Monthly USD:  {@code ai:usage:{userId}:month:{YYYY-MM}:usd}    — TTL 45 days
 *  - Monthly tokens: {@code ai:usage:{userId}:month:{YYYY-MM}:tokens} — TTL 45 days
 *  - Monthly reqs: {@code ai:usage:{userId}:month:{YYYY-MM}:req}    — TTL 45 days
 *
 * TTL strategy: set only on first write (when the counter goes from absent → delta).
 * This is single-instance safe. A future Lua-script atomic upgrade is noted in M1
 * progress.md as a carry-forward item.
 *
 * All methods are intentionally non-transactional — a partial increment is better
 * than blocking an AI request on a Redis failure.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RedisUsageCounters {

    static final String  USAGE_KEY_PREFIX    = "ai:usage:";
    static final long    USAGE_DAY_TTL_SEC   = 48L * 3600;        // 48h rolling window
    static final long    USAGE_MONTH_TTL_SEC = 45L * 24 * 3600;   // 45 days

    private final RedisTemplate<String, String> redisTemplate;

    // -------------------------------------------------------------------------
    // Read helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the accumulated USD spend for {@code userId} today.
     * Returns 0.0 when no entry exists (first call of the day).
     */
    public double getDailyUsd(String userId) {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        return readDouble(USAGE_KEY_PREFIX + userId + ":day:" + today + ":usd");
    }

    /**
     * Returns the accumulated USD spend for {@code userId} this calendar month.
     */
    public double getMonthlyUsd(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return readDouble(USAGE_KEY_PREFIX + userId + ":month:" + month + ":usd");
    }

    /**
     * Returns the accumulated LLM token count for {@code userId} this calendar month.
     */
    public long getMonthlyTokens(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return readLong(USAGE_KEY_PREFIX + userId + ":month:" + month + ":tokens");
    }

    /**
     * Returns the accumulated request count for {@code userId} this calendar month.
     */
    public long getMonthlyRequests(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return readLong(USAGE_KEY_PREFIX + userId + ":month:" + month + ":req");
    }

    // -------------------------------------------------------------------------
    // Write helpers — called by AiAccessService.recordUsage on stream completion
    // -------------------------------------------------------------------------

    /**
     * Increments all four counters for a completed agent call.
     *
     * Safe to call fire-and-forget: individual counter failures are logged at WARN
     * and do not propagate to the caller.
     *
     * @param userId  the authenticated user's Google sub claim
     * @param tokens  LLM tokens consumed during the call
     * @param costUsd estimated USD cost for the call
     */
    public void increment(String userId, int tokens, double costUsd) {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));

        String dayUsdKey      = USAGE_KEY_PREFIX + userId + ":day:" + today + ":usd";
        String monthUsdKey    = USAGE_KEY_PREFIX + userId + ":month:" + month + ":usd";
        String monthTokensKey = USAGE_KEY_PREFIX + userId + ":month:" + month + ":tokens";
        String monthReqKey    = USAGE_KEY_PREFIX + userId + ":month:" + month + ":req";

        incrementDoubleWithTtl(dayUsdKey, costUsd, USAGE_DAY_TTL_SEC);
        incrementDoubleWithTtl(monthUsdKey, costUsd, USAGE_MONTH_TTL_SEC);
        incrementLongWithTtl(monthTokensKey, tokens, USAGE_MONTH_TTL_SEC);
        incrementLongWithTtl(monthReqKey, 1, USAGE_MONTH_TTL_SEC);
    }

    // -------------------------------------------------------------------------
    // Package-private accessors for AiAccessService.isOverCap
    // -------------------------------------------------------------------------

    /**
     * Reads the daily USD value as a BigDecimal — avoids floating-point drift when
     * comparing against cap values stored as BigDecimal in {@link GrantCacheEntry}.
     */
    BigDecimal getDailyUsdBigDecimal(String userId) {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        return BigDecimal.valueOf(readDouble(USAGE_KEY_PREFIX + userId + ":day:" + today + ":usd"));
    }

    BigDecimal getMonthlyUsdBigDecimal(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return BigDecimal.valueOf(readDouble(USAGE_KEY_PREFIX + userId + ":month:" + month + ":usd"));
    }

    long getMonthlyTokensRaw(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return readLong(USAGE_KEY_PREFIX + userId + ":month:" + month + ":tokens");
    }

    long getMonthlyRequestsRaw(String userId) {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        return readLong(USAGE_KEY_PREFIX + userId + ":month:" + month + ":req");
    }

    // -------------------------------------------------------------------------
    // Low-level Redis operations
    // -------------------------------------------------------------------------

    /**
     * Atomically increments a floating-point counter.
     * Sets TTL only when the key is created for the first time (new val ≈ delta).
     */
    void incrementDoubleWithTtl(String key, double delta, long ttlSeconds) {
        try {
            Double newVal = redisTemplate.opsForValue().increment(key, delta);
            // Set TTL on first write: newVal is ≤ delta + tiny float epsilon
            if (newVal != null && newVal <= delta + 0.0001) {
                redisTemplate.expire(key, ttlSeconds, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            log.warn("Redis INCRBYFLOAT failed for key [{}]: {}", key, e.getMessage());
        }
    }

    /**
     * Atomically increments an integer counter.
     * Sets TTL when the key is created for the first time.
     */
    void incrementLongWithTtl(String key, long delta, long ttlSeconds) {
        try {
            Long newVal = redisTemplate.opsForValue().increment(key, delta);
            if (newVal != null && newVal <= delta) {
                redisTemplate.expire(key, ttlSeconds, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            log.warn("Redis INCRBY failed for key [{}]: {}", key, e.getMessage());
        }
    }

    private double readDouble(String key) {
        try {
            String val = redisTemplate.opsForValue().get(key);
            return val != null ? Double.parseDouble(val) : 0.0;
        } catch (Exception e) {
            log.warn("Failed to read double from Redis key [{}]: {}", key, e.getMessage());
            return 0.0;
        }
    }

    private long readLong(String key) {
        try {
            String val = redisTemplate.opsForValue().get(key);
            return val != null ? Long.parseLong(val) : 0L;
        } catch (Exception e) {
            log.warn("Failed to read long from Redis key [{}]: {}", key, e.getMessage());
            return 0L;
        }
    }
}
