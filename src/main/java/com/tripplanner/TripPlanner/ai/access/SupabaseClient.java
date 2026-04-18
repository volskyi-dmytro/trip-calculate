package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeoutException;

/**
 * Thin WebClient wrapper for Supabase REST API calls needed by the AI access layer.
 *
 * Three operations:
 *  - fetchGrant    : GET ai_access_grants filtered by user_id
 *  - incrementUsage: POST to increment_ai_usage RPC (fire-and-forget via .subscribe())
 *
 * All HTTP errors are caught and converted to appropriate return values so callers
 * never receive an unhandled reactor exception.
 *
 * SECURITY: The service_role key is injected from env via @Value.
 * It is never logged, not even at TRACE level.
 */
@Component
@Slf4j
public class SupabaseClient {

    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(3);

    private final WebClient supabaseWebClient;
    private final ObjectMapper objectMapper;
    private final String serviceRoleKey;

    /**
     * Constructor injection — required for testability and per CLAUDE.md conventions.
     * The WebClient qualifier selects the Supabase-scoped bean from AiAccessConfig.
     * The service_role key is pulled from env via @Value at construction time so it
     * is never stored as a mutable field that could leak to subclasses.
     */
    public SupabaseClient(
            @Qualifier("supabaseWebClient") WebClient supabaseWebClient,
            ObjectMapper objectMapper,
            @Value("${ai.access.supabase-service-role-key}") String serviceRoleKey) {
        this.supabaseWebClient = supabaseWebClient;
        this.objectMapper = objectMapper;
        this.serviceRoleKey = serviceRoleKey;
    }

    /**
     * Fetches the ai_access_grants row for the given userId from Supabase.
     *
     * Returns:
     *  - Optional.of(entry) if a matching enabled or disabled row was found
     *  - Optional.empty()   if the array was empty (no row) or on any HTTP error
     *
     * Negative results (Optional.empty) are cached by the caller with a short TTL.
     * Times out after 3s; on TimeoutException returns Optional.empty() (fail-closed).
     */
    public Mono<Optional<GrantCacheEntry>> fetchGrant(String userId) {
        return supabaseWebClient.get()
                // Blocker 10: use URI template so UriBuilder percent-encodes userId per RFC 3986
                .uri(uriBuilder -> uriBuilder
                        .path("/rest/v1/ai_access_grants")
                        .queryParam("user_id", "eq.{sub}")
                        .queryParam("select", "enabled,monthly_token_cap,monthly_req_cap,daily_usd_cap,monthly_usd_cap")
                        .build(userId))
                .header("apikey", serviceRoleKey)
                .header("Authorization", "Bearer " + serviceRoleKey)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> {
                    log.warn("Supabase grant lookup returned HTTP {}", response.statusCode().value());
                    return response.releaseBody().then(Mono.empty());
                })
                .bodyToMono(String.class)
                .map(body -> parseGrantResponse(body, userId))
                // Blocker 1: 3s timeout; fail-closed on TimeoutException
                .timeout(FETCH_TIMEOUT)
                .onErrorResume(TimeoutException.class, ex -> {
                    log.warn("Supabase grant lookup timed out for userId (hashed: {}): {}",
                            hashUserId(userId), ex.getMessage());
                    return Mono.just(Optional.empty());
                })
                .onErrorResume(ex -> {
                    log.warn("Supabase grant lookup failed: {}", ex.getMessage());
                    return Mono.just(Optional.empty());
                });
    }

    /**
     * Posts usage increments to the increment_ai_usage RPC function.
     * Intended to be called fire-and-forget (.subscribe() at the call site).
     * Errors are swallowed and logged at WARN; they must not block the response.
     * Times out after 3s; on TimeoutException returns Mono.empty() silently.
     */
    public Mono<Void> incrementUsage(String userId, int tokens, double costUsd) {
        String body;
        try {
            body = objectMapper.writeValueAsString(
                    java.util.Map.of(
                            "p_user_id", userId,
                            "p_tokens", tokens,
                            "p_cost", costUsd));
        } catch (Exception e) {
            log.warn("Failed to serialise increment_ai_usage body");
            return Mono.empty();
        }

        return supabaseWebClient.post()
                .uri("/rest/v1/rpc/increment_ai_usage")
                .header("apikey", serviceRoleKey)
                .header("Authorization", "Bearer " + serviceRoleKey)
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, response -> {
                    log.warn("increment_ai_usage RPC returned HTTP {}", response.statusCode().value());
                    return response.releaseBody().then(Mono.empty());
                })
                .bodyToMono(Void.class)
                // Blocker 1: 3s timeout; fire-and-forget so TimeoutException just returns empty
                .timeout(FETCH_TIMEOUT)
                .onErrorResume(TimeoutException.class, ex -> {
                    log.warn("increment_ai_usage timed out: {}", ex.getMessage());
                    return Mono.empty();
                })
                .onErrorResume(ex -> {
                    log.warn("increment_ai_usage failed: {}", ex.getMessage());
                    return Mono.empty();
                });
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private Optional<GrantCacheEntry> parseGrantResponse(String json, String userId) {
        try {
            JsonNode root = objectMapper.readTree(json);
            if (!root.isArray() || root.isEmpty()) {
                log.debug("Supabase returned no grant row");
                return Optional.empty();
            }
            JsonNode row = root.get(0);

            // Blocker 2: PostgREST returns numeric(6,4) and numeric(8,2) as JSON strings.
            // Use BigDecimal to parse them correctly; asDouble() on a TextNode returns 0.0 silently.
            BigDecimal dailyUsdCap   = parseBigDecimal(row, "daily_usd_cap");
            BigDecimal monthlyUsdCap = parseBigDecimal(row, "monthly_usd_cap");

            // monthly_token_cap and monthly_req_cap are integer columns — PostgREST returns them as numbers.
            // asLong(0) handles both numeric JSON nodes and string-encoded ints gracefully.
            GrantCacheEntry entry = GrantCacheEntry.of(
                    row.path("enabled").asBoolean(false),
                    row.path("monthly_token_cap").asLong(0),
                    row.path("monthly_req_cap").asLong(0),
                    dailyUsdCap,
                    monthlyUsdCap);
            log.debug("Supabase grant row found: enabled={}", entry.enabled());
            return Optional.of(entry);
        } catch (Exception e) {
            log.warn("Failed to parse Supabase grant response: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Parses a BigDecimal from a JSON field that may be either a numeric node or
     * a string node (as PostgREST returns for numeric(p,s) columns).
     */
    private BigDecimal parseBigDecimal(JsonNode node, String field) {
        JsonNode fieldNode = node.path(field);
        if (fieldNode.isMissingNode() || fieldNode.isNull()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(fieldNode.asText());
        } catch (NumberFormatException e) {
            log.warn("Could not parse BigDecimal from field '{}' value '{}', defaulting to 0",
                    field, fieldNode.asText());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Returns a short hash prefix of the userId for log lines at WARN/INFO level.
     * Full userId is never logged above DEBUG per Blocker 5.
     */
    private String hashUserId(String userId) {
        if (userId == null) return "null";
        int h = userId.hashCode();
        return Integer.toHexString(h & 0xFFFF);
    }
}
