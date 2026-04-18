package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for GrantCacheEntry Jackson round-trip (Blocker 3).
 *
 * Verifies that:
 *  1. serialize → deserialize preserves all five fields identically.
 *  2. Extra "granted" and "noGrant" JSON properties (produced by isGranted() / isNoGrant()
 *     before the @JsonIgnore fix) no longer appear in serialised output, so deserialization
 *     via @JsonCreator never fails with an unknown-field error.
 */
class GrantCacheEntryTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("GrantCacheEntry round-trips through Jackson without losing any field")
    void jacksonRoundTrip_preservesAllFields() throws Exception {
        GrantCacheEntry original = GrantCacheEntry.of(
                true,
                100_000L,
                500L,
                new BigDecimal("0.5000"),
                new BigDecimal("10.00"));

        String json = objectMapper.writeValueAsString(original);
        GrantCacheEntry deserialized = objectMapper.readValue(json, GrantCacheEntry.class);

        assertThat(deserialized.enabled()).isEqualTo(original.enabled());
        assertThat(deserialized.monthlyTokenCap()).isEqualTo(original.monthlyTokenCap());
        assertThat(deserialized.monthlyReqCap()).isEqualTo(original.monthlyReqCap());
        assertThat(deserialized.dailyUsdCap().compareTo(original.dailyUsdCap())).isZero();
        assertThat(deserialized.monthlyUsdCap().compareTo(original.monthlyUsdCap())).isZero();
    }

    @Test
    @DisplayName("Serialised JSON does not contain 'granted' or 'noGrant' fields")
    void serialisedJson_doesNotContainHelperMethodProperties() throws Exception {
        GrantCacheEntry entry = GrantCacheEntry.of(
                true, 100_000L, 500L, new BigDecimal("0.5000"), new BigDecimal("10.00"));

        String json = objectMapper.writeValueAsString(entry);

        // isGranted() and isNoGrant() are annotated @JsonIgnore — they must not appear.
        assertThat(json).doesNotContain("\"granted\"");
        assertThat(json).doesNotContain("\"noGrant\"");
    }

    @Test
    @DisplayName("NO_GRANT sentinel round-trips correctly")
    void noGrantSentinel_roundTrips() throws Exception {
        GrantCacheEntry original = GrantCacheEntry.NO_GRANT;
        String json = objectMapper.writeValueAsString(original);
        GrantCacheEntry deserialized = objectMapper.readValue(json, GrantCacheEntry.class);

        assertThat(deserialized.enabled()).isFalse();
        assertThat(deserialized.monthlyTokenCap()).isZero();
        assertThat(deserialized.monthlyReqCap()).isZero();
        assertThat(deserialized.dailyUsdCap().compareTo(BigDecimal.ZERO)).isZero();
        assertThat(deserialized.monthlyUsdCap().compareTo(BigDecimal.ZERO)).isZero();
        assertThat(deserialized.isNoGrant()).isTrue();
    }
}
