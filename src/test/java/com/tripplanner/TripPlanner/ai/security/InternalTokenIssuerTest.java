package com.tripplanner.TripPlanner.ai.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for InternalTokenIssuer.
 *
 * Verifies:
 *  - Token can be issued and round-trips with the same secret
 *  - 'sub' claim matches the userId passed to issue()
 *  - 'exp' is within 30 seconds of now (as required by CLAUDE.md rule 7)
 *  - Null or blank userId is rejected
 */
class InternalTokenIssuerTest {

    // 64-char hex string — matches what `openssl rand -hex 32` produces
    private static final String TEST_SECRET =
            "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

    private InternalTokenIssuer issuer;
    private SecretKey verifyKey;

    @BeforeEach
    void setUp() {
        issuer = new InternalTokenIssuer(TEST_SECRET);
        verifyKey = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("Issued token parses with the same secret and has correct 'sub'")
    void issuedToken_parsesWithSameSecret() {
        String userId = "google-sub-abc";
        String token = issuer.issue(userId);

        Claims claims = Jwts.parser()
                .verifyWith(verifyKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        assertThat(claims.getSubject()).isEqualTo(userId);
    }

    @Test
    @DisplayName("Token 'exp' is within 30 seconds of now")
    void issuedToken_expWithin30Seconds() {
        long beforeMs = System.currentTimeMillis();
        String token = issuer.issue("some-user");
        long afterMs = System.currentTimeMillis();

        Claims claims = Jwts.parser()
                .verifyWith(verifyKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        Date expiration = claims.getExpiration();
        assertThat(expiration).isNotNull();

        long expMs = expiration.getTime();
        // exp must be after (now + 29s) and before (now + 31s) with slight tolerance
        assertThat(expMs).isGreaterThan(beforeMs + 29_000L);
        assertThat(expMs).isLessThan(afterMs  + 31_000L);
    }

    @Test
    @DisplayName("Token has 'iat' claim set")
    void issuedToken_hasIat() {
        String token = issuer.issue("user-with-iat");

        Claims claims = Jwts.parser()
                .verifyWith(verifyKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        assertThat(claims.getIssuedAt()).isNotNull();
    }

    @Test
    @DisplayName("Null userId throws IllegalArgumentException")
    void nullUserId_throwsException() {
        assertThatThrownBy(() -> issuer.issue(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("userId");
    }

    @Test
    @DisplayName("Blank userId throws IllegalArgumentException")
    void blankUserId_throwsException() {
        assertThatThrownBy(() -> issuer.issue("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("userId");
    }
}
