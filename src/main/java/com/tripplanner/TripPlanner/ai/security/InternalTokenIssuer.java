package com.tripplanner.TripPlanner.ai.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
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
     * @param userId the authenticated user's Google sub claim
     * @return compact JWT string
     * @throws IllegalArgumentException if userId is null or blank
     */
    public String issue(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId must not be null or blank");
        }

        long now = System.currentTimeMillis();
        Date issuedAt  = new Date(now);
        Date expiresAt = new Date(now + TOKEN_VALIDITY_MS);

        return Jwts.builder()
                .subject(userId)
                .issuedAt(issuedAt)
                .expiration(expiresAt)
                .signWith(signingKey)
                .compact();
    }
}
