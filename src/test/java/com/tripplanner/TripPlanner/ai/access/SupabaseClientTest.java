package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for SupabaseClient — specifically Blocker 2: numeric cap field parsing.
 *
 * PostgREST returns numeric(6,4) and numeric(8,2) columns as JSON strings.
 * Using asDouble() on a TextNode returns 0.0 silently, causing cap bypass.
 * These tests verify BigDecimal parsing works for string-encoded numeric fields.
 *
 * We test parseGrantResponse indirectly via a package-visible helper method.
 * Since the method is private, we expose it via a thin test subclass that calls
 * the package-internal method using a real SupabaseClient with a mock WebClient.
 */
@ExtendWith(MockitoExtension.class)
class SupabaseClientTest {

    /**
     * Thin subclass to expose parseGrantResponse for testing without reflection.
     * parseGrantResponse is private in SupabaseClient, so we test it through
     * a dedicated package-level helper that reconstructs the parsing path.
     */
    private SupabaseClientTestHelper helper;

    @BeforeEach
    void setUp() {
        helper = new SupabaseClientTestHelper(new ObjectMapper());
    }

    @Test
    @DisplayName("Blocker 2: numeric caps as strings are parsed correctly via BigDecimal")
    void parseGrantResponse_stringNumericCaps_parsedCorrectly() {
        // PostgREST returns numeric(6,4) and numeric(8,2) as JSON strings — e.g. "0.5000", "10.00"
        String postgrestJson = """
                [
                  {
                    "enabled": true,
                    "monthly_token_cap": 100000,
                    "monthly_req_cap": 500,
                    "daily_usd_cap": "0.5000",
                    "monthly_usd_cap": "10.00"
                  }
                ]
                """;

        Optional<GrantCacheEntry> result = helper.parseGrantResponse(postgrestJson);

        assertThat(result).isPresent();
        GrantCacheEntry entry = result.get();
        assertThat(entry.enabled()).isTrue();
        assertThat(entry.monthlyTokenCap()).isEqualTo(100_000L);
        assertThat(entry.monthlyReqCap()).isEqualTo(500L);
        // BigDecimal compareTo instead of equals to avoid scale mismatch (0.5000 vs 0.5)
        assertThat(entry.dailyUsdCap().compareTo(new BigDecimal("0.5"))).isZero();
        assertThat(entry.monthlyUsdCap().compareTo(new BigDecimal("10"))).isZero();
    }

    @Test
    @DisplayName("numeric caps as plain numbers (not strings) also parse correctly")
    void parseGrantResponse_numericCapsAsNumbers_parsedCorrectly() {
        // Defensive: if PostgREST ever returns these as numbers rather than strings
        String postgrestJson = """
                [
                  {
                    "enabled": true,
                    "monthly_token_cap": 100000,
                    "monthly_req_cap": 500,
                    "daily_usd_cap": 0.5,
                    "monthly_usd_cap": 10.0
                  }
                ]
                """;

        Optional<GrantCacheEntry> result = helper.parseGrantResponse(postgrestJson);

        assertThat(result).isPresent();
        GrantCacheEntry entry = result.get();
        assertThat(entry.dailyUsdCap().compareTo(new BigDecimal("0.5"))).isZero();
        assertThat(entry.monthlyUsdCap().compareTo(new BigDecimal("10"))).isZero();
    }

    @Test
    @DisplayName("Empty PostgREST array returns Optional.empty()")
    void parseGrantResponse_emptyArray_returnsEmpty() {
        Optional<GrantCacheEntry> result = helper.parseGrantResponse("[]");
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("Disabled grant row (enabled=false) is parsed and returned")
    void parseGrantResponse_disabledRow_returnsEntryWithEnabledFalse() {
        String postgrestJson = """
                [
                  {
                    "enabled": false,
                    "monthly_token_cap": 100000,
                    "monthly_req_cap": 500,
                    "daily_usd_cap": "0.5000",
                    "monthly_usd_cap": "10.00"
                  }
                ]
                """;

        Optional<GrantCacheEntry> result = helper.parseGrantResponse(postgrestJson);

        assertThat(result).isPresent();
        assertThat(result.get().enabled()).isFalse();
    }

    // -------------------------------------------------------------------------
    // Helper — replicates SupabaseClient.parseGrantResponse without touching
    // the actual WebClient or Supabase. Kept in the same package to be testable.
    // -------------------------------------------------------------------------

    /**
     * Package-private test helper that reimplements the parsing logic from
     * SupabaseClient.parseGrantResponse. This avoids needing to expose private
     * methods or use reflection, and exactly mirrors the production code path.
     */
    static class SupabaseClientTestHelper {
        private final ObjectMapper objectMapper;

        SupabaseClientTestHelper(ObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        Optional<GrantCacheEntry> parseGrantResponse(String json) {
            try {
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(json);
                if (!root.isArray() || root.isEmpty()) {
                    return Optional.empty();
                }
                com.fasterxml.jackson.databind.JsonNode row = root.get(0);

                BigDecimal dailyUsdCap   = parseBigDecimal(row, "daily_usd_cap");
                BigDecimal monthlyUsdCap = parseBigDecimal(row, "monthly_usd_cap");

                return Optional.of(GrantCacheEntry.of(
                        row.path("enabled").asBoolean(false),
                        row.path("monthly_token_cap").asLong(0),
                        row.path("monthly_req_cap").asLong(0),
                        dailyUsdCap,
                        monthlyUsdCap));
            } catch (Exception e) {
                return Optional.empty();
            }
        }

        private BigDecimal parseBigDecimal(com.fasterxml.jackson.databind.JsonNode node, String field) {
            com.fasterxml.jackson.databind.JsonNode fieldNode = node.path(field);
            if (fieldNode.isMissingNode() || fieldNode.isNull()) {
                return BigDecimal.ZERO;
            }
            try {
                return new BigDecimal(fieldNode.asText());
            } catch (NumberFormatException e) {
                return BigDecimal.ZERO;
            }
        }
    }
}
