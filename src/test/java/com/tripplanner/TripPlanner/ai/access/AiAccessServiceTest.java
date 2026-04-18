package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AiAccessService.
 *
 * Redis and SupabaseClient are mocked to allow fast, isolated testing.
 * Bucket4j buckets are in-memory (no external dependency).
 *
 * Coverage:
 *  1. Grant cache hit — granted
 *  2. Grant cache hit — disabled (no_grant sentinel)
 *  3. Grant cache miss → Supabase hit (enabled) → GRANTED
 *  4. Grant cache miss → Supabase returns no row → NO_GRANT
 *  5. Grant row disabled → NO_GRANT
 *  6. Over daily USD cap → OVER_CAP
 *  7. Over monthly USD cap → OVER_CAP
 *  8. Rate limited (user bucket) → RATE_LIMITED
 */
@ExtendWith(MockitoExtension.class)
class AiAccessServiceTest {

    @Mock
    private RedisTemplate<String, String> redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOps;

    @Mock
    private SupabaseClient supabaseClient;

    private AiAccessService service;
    private ObjectMapper objectMapper;

    private static final String USER_ID = "google-sub-test";
    private static final String IP      = "10.0.0.1";

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        when(redisTemplate.opsForValue()).thenReturn(valueOps);

        // RedisUsageCounters is a pure collaborator wrapping the same RedisTemplate mock.
        // Constructing it here rather than mocking it means the existing valueOps stubs
        // in each test continue to drive the cap-check logic unchanged.
        RedisUsageCounters usageCounters = new RedisUsageCounters(redisTemplate);

        service = new AiAccessService(redisTemplate, supabaseClient, objectMapper, usageCounters);
    }

    // -------------------------------------------------------------------------
    // 1. Cache hit — granted
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Grant cache hit (enabled=true) within caps → GRANTED")
    void grantCacheHit_granted() throws Exception {
        GrantCacheEntry entry = new GrantCacheEntry(true, 100_000L, 500L, new BigDecimal("1.0"), new BigDecimal("10.0"));
        String json = objectMapper.writeValueAsString(entry);
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(json);

        // Usage counters: stub any key that doesn't match the grant key to return null.
        // RedisTemplate.opsForValue().get() takes Object, so we cast in the predicate.
        when(valueOps.get(argThat(k -> k instanceof String s && s.startsWith("ai:usage:"))))
                .thenReturn(null);

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.GRANTED);
        // Supabase should NOT have been called on a cache hit
        verifyNoInteractions(supabaseClient);
    }

    // -------------------------------------------------------------------------
    // 2. Cache hit — disabled (NO_GRANT sentinel stored under short TTL)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Grant cache hit (NO_GRANT sentinel) → NO_GRANT without Supabase call")
    void grantCacheHit_noGrantSentinel() throws Exception {
        String json = objectMapper.writeValueAsString(GrantCacheEntry.NO_GRANT);
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(json);

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.NO_GRANT);
        verifyNoInteractions(supabaseClient);
    }

    // -------------------------------------------------------------------------
    // 3. Cache miss → Supabase hit → GRANTED
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Grant cache miss → Supabase returns enabled grant → GRANTED")
    void grantCacheMiss_supabaseHit_granted() throws Exception {
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(null);
        when(valueOps.get(argThat(k -> k instanceof String s && s.startsWith("ai:usage:"))))
                .thenReturn(null);

        GrantCacheEntry supabaseEntry = new GrantCacheEntry(true, 100_000L, 500L, new BigDecimal("1.0"), new BigDecimal("10.0"));
        when(supabaseClient.fetchGrant(USER_ID)).thenReturn(Mono.just(Optional.of(supabaseEntry)));

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.GRANTED);
        verify(supabaseClient).fetchGrant(USER_ID);
        // Grant should be cached after Supabase lookup with positive TTL (60s)
        verify(valueOps).set(eq("ai:grant:" + USER_ID), anyString(), eq(60L), any());
    }

    // -------------------------------------------------------------------------
    // 4. Cache miss → Supabase returns empty → NO_GRANT
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Grant cache miss → Supabase returns empty array → NO_GRANT")
    void grantCacheMiss_supabaseEmpty_noGrant() {
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(null);
        when(supabaseClient.fetchGrant(USER_ID)).thenReturn(Mono.just(Optional.empty()));

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.NO_GRANT);
        // Negative result should be cached with short TTL (10s)
        verify(valueOps).set(eq("ai:grant:" + USER_ID), anyString(), eq(10L), any());
    }

    // -------------------------------------------------------------------------
    // 5. Grant row disabled → NO_GRANT
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Supabase grant row exists but enabled=false → NO_GRANT")
    void grantRowDisabled_noGrant() {
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(null);
        GrantCacheEntry disabled = new GrantCacheEntry(false, 100_000L, 500L, new BigDecimal("1.0"), new BigDecimal("10.0"));
        when(supabaseClient.fetchGrant(USER_ID)).thenReturn(Mono.just(Optional.of(disabled)));

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.NO_GRANT);
        // Negative result cached with short TTL (10s)
        verify(valueOps).set(eq("ai:grant:" + USER_ID), anyString(), eq(10L), any());
    }

    // -------------------------------------------------------------------------
    // 6. Over daily USD cap → OVER_CAP
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Daily USD cap exceeded → OVER_CAP")
    void overDailyUsdCap_overCap() throws Exception {
        GrantCacheEntry entry = new GrantCacheEntry(true, 100_000L, 500L, new BigDecimal("0.50"), new BigDecimal("10.0"));
        String json = objectMapper.writeValueAsString(entry);
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(json);

        // Daily USD key returns a value at or above cap; check short-circuits here.
        // Monthly stubs are omitted — they are never reached when daily cap fires first.
        when(valueOps.get(argThat(k -> k instanceof String s && s.contains(":day:") && s.endsWith(":usd"))))
                .thenReturn("0.50");

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.OVER_CAP);
    }

    // -------------------------------------------------------------------------
    // 7. Over monthly USD cap → OVER_CAP
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Monthly USD cap exceeded → OVER_CAP")
    void overMonthlyUsdCap_overCap() throws Exception {
        GrantCacheEntry entry = new GrantCacheEntry(true, 100_000L, 500L, new BigDecimal("1.0"), new BigDecimal("10.0"));
        String json = objectMapper.writeValueAsString(entry);
        when(valueOps.get("ai:grant:" + USER_ID)).thenReturn(json);

        // Daily under cap
        when(valueOps.get(argThat(k -> k instanceof String s && s.contains(":day:") && s.endsWith(":usd"))))
                .thenReturn("0.10");
        // Monthly USD at cap
        when(valueOps.get(argThat(k -> k instanceof String s && s.contains(":month:") && s.endsWith(":usd"))))
                .thenReturn("10.0");
        // Monthly tokens and reqs under cap (not stubbed, Mockito returns null by default)

        AccessResult result = service.check(USER_ID, IP);

        assertThat(result).isEqualTo(AccessResult.OVER_CAP);
    }

    // -------------------------------------------------------------------------
    // 8. Rate limited (exhaust user bucket)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("User rate limit bucket exhausted → RATE_LIMITED")
    void rateLimited_userBucket() throws Exception {
        // Exhaust the 60/min user bucket by calling check() 61 times with same userId.
        // We use a unique userId so we get a fresh bucket not shared with other tests.
        String freshUser = "rate-limited-user-" + System.nanoTime();

        // Stub grant cache to return a valid grant so the first 60 checks pass through.
        GrantCacheEntry entry = new GrantCacheEntry(true, 100_000L, 500L, new BigDecimal("1.0"), new BigDecimal("10.0"));
        String json = objectMapper.writeValueAsString(entry);
        when(valueOps.get("ai:grant:" + freshUser)).thenReturn(json);
        // Usage counters at 0
        when(valueOps.get(argThat(k -> k instanceof String s && s.startsWith("ai:usage:"))))
                .thenReturn(null);

        AccessResult lastResult = null;
        for (int i = 0; i <= 60; i++) {
            lastResult = service.check(freshUser, "10.0.0.98");
        }

        // The 61st call (loop index 60) should be rate limited
        assertThat(lastResult).isEqualTo(AccessResult.RATE_LIMITED);
    }
}
