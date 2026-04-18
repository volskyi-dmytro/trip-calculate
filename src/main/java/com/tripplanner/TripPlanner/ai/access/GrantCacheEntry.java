package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * Serializable cache entry for Supabase ai_access_grants rows.
 * Stored in Redis under key {@code ai:grant:{userId}} with a 60s TTL for positive
 * results and 10s TTL for negative results (no grant row found).
 *
 * Jackson-serialisable — uses explicit @JsonCreator so it works with the default
 * ObjectMapper configuration (no special module needed).
 *
 * Blocker 2: USD cap fields use BigDecimal to correctly parse PostgREST's string-encoded
 * numeric(p,s) columns ("0.5000", "10.00"). asDouble() on a TextNode silently returns 0.0.
 *
 * Blocker 3: @JsonIgnoreProperties(ignoreUnknown=true) prevents unknown-field failures
 * on cache reads. @JsonIgnore on boolean helper methods prevents Jackson from serializing
 * "granted" and "noGrant" as extra fields that then break the @JsonCreator on deserialization.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GrantCacheEntry(
        boolean enabled,
        long monthlyTokenCap,
        long monthlyReqCap,
        BigDecimal dailyUsdCap,
        BigDecimal monthlyUsdCap
) {

    /** Sentinel value used when Supabase returns an empty array (user has no grant row). */
    public static final GrantCacheEntry NO_GRANT =
            new GrantCacheEntry(false, 0, 0, BigDecimal.ZERO, BigDecimal.ZERO);

    @JsonCreator
    public static GrantCacheEntry of(
            @JsonProperty("enabled") boolean enabled,
            @JsonProperty("monthlyTokenCap") long monthlyTokenCap,
            @JsonProperty("monthlyReqCap") long monthlyReqCap,
            @JsonProperty("dailyUsdCap") BigDecimal dailyUsdCap,
            @JsonProperty("monthlyUsdCap") BigDecimal monthlyUsdCap) {
        return new GrantCacheEntry(
                enabled,
                monthlyTokenCap,
                monthlyReqCap,
                dailyUsdCap  != null ? dailyUsdCap  : BigDecimal.ZERO,
                monthlyUsdCap != null ? monthlyUsdCap : BigDecimal.ZERO);
    }

    /**
     * Returns true when this entry represents a valid, enabled grant.
     * @JsonIgnore prevents Jackson from serializing "granted" as a separate JSON field,
     * which would cause an unknown-field error on deserialization via @JsonCreator.
     */
    @JsonIgnore
    public boolean isGranted() {
        return enabled;
    }

    /**
     * Returns true when this is the NO_GRANT sentinel (no row in Supabase).
     * @JsonIgnore for the same reason as isGranted().
     */
    @JsonIgnore
    public boolean isNoGrant() {
        return !enabled && monthlyTokenCap == 0 && monthlyReqCap == 0
                && BigDecimal.ZERO.compareTo(dailyUsdCap) == 0
                && BigDecimal.ZERO.compareTo(monthlyUsdCap) == 0;
    }
}
