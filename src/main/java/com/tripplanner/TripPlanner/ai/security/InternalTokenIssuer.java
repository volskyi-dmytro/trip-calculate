package com.tripplanner.TripPlanner.ai.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues HS256 JWTs for internal Spring Boot → langgraph-agent communication.
 *
 * Contract (per CLAUDE.md rule 7):
 *  - Algorithm: HS256
 *  - Secret:    {@code INTERNAL_JWT_SECRET} env var (minimum 32 bytes recommended)
 *  - Claims:    {@code sub} (userId), {@code iat} (issued-at), {@code exp} (now + 30s)
 *  - Refuses to issue if userId is null or blank
 *
 * Tokens are not cached — they should be generated fresh per outbound request
 * because the 30s window is very tight.
 *
 * Used by M2's AgentController when forwarding requests to the Python service.
 * Scaffolded here in M1 so M2 can just inject and call.
 *
 * SECURITY: The secret key is never logged.
 */
@Component
@Slf4j
public class InternalTokenIssuer {

    private static final long TOKEN_VALIDITY_MS = 30_000L; // 30 seconds

    private final SecretKey signingKey;

    public InternalTokenIssuer(@Value("${ai.access.internal-jwt-secret}") String secret) {
        // Keys.hmacShaKeyFor requires at least 256-bit (32-byte) key for HS256.
        // If the env var is hex-encoded (as openssl rand -hex 32 produces), use it directly
        // as UTF-8 bytes — 64 hex chars = 64 bytes, well above the 32-byte minimum.
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        log.debug("InternalTokenIssuer initialised (key length: {} bytes)", secret.length());
    }

    /**
     * Issues a short-lived HS256 JWT for internal service-to-service calls.
     *
     * Backward-compatible overload — emits a token without per-user cap claims.
     * Prefer {@link #issue(String, BigDecimal, BigDecimal)} so the agent can
     * enforce daily/monthly USD caps in BudgetGuardMiddleware without round-
     * tripping to Supabase.
     *
     * @param userId the authenticated user's Google sub claim
     * @return compact JWT string
     * @throws IllegalArgumentException if userId is null or blank
     */
    public String issue(String userId) {
        return issue(userId, null, null);
    }

    /**
     * Issues a short-lived HS256 JWT with per-user USD cap claims (M5).
     *
     * The Python BudgetGuardMiddleware reads {@code daily_cap_usd} and
     * {@code monthly_cap_usd} from the JWT to perform pre-call enforcement
     * against Redis usage counters — this avoids a synchronous Supabase round
     * trip on every model call.
     *
     * Null caps are omitted from the token (verify_internal_jwt fills in a
     * conservative default and logs WARNING — used during the M4→M5 deploy
     * window so older callers do not break).
     *
     * @param userId         the authenticated user's Google sub claim
     * @param dailyCapUsd    daily USD spend cap from ai_access_grants (nullable)
     * @param monthlyCapUsd  monthly USD spend cap from ai_access_grants (nullable)
     * @return compact JWT string
     * @throws IllegalArgumentException if userId is null or blank
     */
    public String issue(String userId, BigDecimal dailyCapUsd, BigDecimal monthlyCapUsd) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId must not be null or blank");
        }

        long now = System.currentTimeMillis();
        Date issuedAt  = new Date(now);
        Date expiresAt = new Date(now + TOKEN_VALIDITY_MS);

        var builder = Jwts.builder()
                .subject(userId)
                .issuedAt(issuedAt)
                .expiration(expiresAt);

        // Emit caps as numeric claims (doubleValue) when present. PyJWT decodes
        // these as floats which is what BudgetGuardMiddleware expects.
        if (dailyCapUsd != null) {
            builder.claim("daily_cap_usd", dailyCapUsd.doubleValue());
        }
        if (monthlyCapUsd != null) {
            builder.claim("monthly_cap_usd", monthlyCapUsd.doubleValue());
        }

        return builder.signWith(signingKey).compact();
    }
}
