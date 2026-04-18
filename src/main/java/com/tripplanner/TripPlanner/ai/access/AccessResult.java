package com.tripplanner.TripPlanner.ai.access;

/**
 * Result of the AiAccessService.check() call.
 *
 * Each outcome carries an optional {@code retryAfterSeconds} value that
 * the filter uses to populate the {@code Retry-After} HTTP header on 429 responses.
 */
public enum AccessResult {

    /** User has a valid, enabled grant and is within all caps. Proceed. */
    GRANTED(200, null),

    /** No grant row exists in Supabase, or the grant row has enabled=false. */
    NO_GRANT(403, null),

    /** User has a valid grant but has exceeded their daily or monthly USD/token/request cap. */
    OVER_CAP(429, 3600L),

    /** User or IP has exceeded the Bucket4j rate limit (60/min user, 120/min IP). */
    RATE_LIMITED(429, 60L);

    private final int httpStatus;
    private final Long retryAfterSeconds;

    AccessResult(int httpStatus, Long retryAfterSeconds) {
        this.httpStatus = httpStatus;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public int httpStatus() {
        return httpStatus;
    }

    /** Seconds to wait before retrying, or null if not applicable. */
    public Long retryAfterSeconds() {
        return retryAfterSeconds;
    }

    public boolean isBlocking() {
        return this != GRANTED;
    }
}
