package com.tripplanner.TripPlanner.ai.access;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for RedisUsageCounters (M2 extraction from AiAccessService).
 *
 * Coverage:
 *  1. increment() writes all four keys with correct TTLs on first write.
 *  2. getDailyUsdBigDecimal() reads the correct day-scoped key.
 *  3. getMonthlyUsdBigDecimal() reads the correct month-scoped key.
 *  4. getMonthlyTokensRaw() and getMonthlyRequestsRaw() read correct keys.
 *  5. TTL edge case: TTL is set only when the returned value equals delta
 *     (i.e. first write); subsequent increments skip the expire call.
 *  6. Redis failure during increment() is absorbed — no exception propagates.
 */
@ExtendWith(MockitoExtension.class)
class RedisUsageCountersTest {

    @Mock
    private RedisTemplate<String, String> redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOps;

    private RedisUsageCounters counters;

    private static final String USER_ID = "user-sub-test";

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        counters = new RedisUsageCounters(redisTemplate);
    }

    // -------------------------------------------------------------------------
    // 1. increment() writes all four counter keys with correct TTLs
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("increment() increments all four Redis keys for a call")
    void increment_writesAllFourKeys() {
        // Stub: all increments return their delta so TTL is set (first-write path).
        // Null-safe lambda because Mockito's argThat may be invoked during argument matching
        // with null to check non-matching invocations in strict stubbing mode.
        when(valueOps.increment(argThat((String k) -> k != null && k.endsWith(":usd")), anyDouble()))
                .thenReturn(0.10);
        when(valueOps.increment(argThat((String k) -> k != null && k.endsWith(":tokens")), anyLong()))
                .thenReturn(500L);
        when(valueOps.increment(argThat((String k) -> k != null && k.endsWith(":req")), anyLong()))
                .thenReturn(1L);

        counters.increment(USER_ID, 500, 0.10);

        // Verify that increment was called on all four key types
        verify(valueOps, atLeastOnce()).increment(
                argThat((String k) -> k != null && k.contains(":day:") && k.endsWith(":usd")), anyDouble());
        verify(valueOps, atLeastOnce()).increment(
                argThat((String k) -> k != null && k.contains(":month:") && k.endsWith(":usd")), anyDouble());
        verify(valueOps, atLeastOnce()).increment(
                argThat((String k) -> k != null && k.endsWith(":tokens")), anyLong());
        verify(valueOps, atLeastOnce()).increment(
                argThat((String k) -> k != null && k.endsWith(":req")), anyLong());
    }

    // -------------------------------------------------------------------------
    // 2. TTL set on first write; not set on subsequent writes
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("TTL is set when counter is at delta (first write)")
    void increment_setsTtlOnFirstWrite() {
        double costUsd = 0.05;
        // Return value == delta → this looks like the first write
        when(valueOps.increment(anyString(), eq(costUsd))).thenReturn(costUsd);

        counters.incrementDoubleWithTtl("test:key", costUsd, RedisUsageCounters.USAGE_DAY_TTL_SEC);

        verify(redisTemplate).expire("test:key", RedisUsageCounters.USAGE_DAY_TTL_SEC, TimeUnit.SECONDS);
    }

    @Test
    @DisplayName("TTL is NOT reset when counter already has a value above delta")
    void increment_doesNotResetTtlOnSubsequentWrite() {
        double costUsd = 0.05;
        // Simulate a subsequent increment: returned value is much larger than delta
        when(valueOps.increment(anyString(), eq(costUsd))).thenReturn(0.30);

        counters.incrementDoubleWithTtl("test:key", costUsd, RedisUsageCounters.USAGE_DAY_TTL_SEC);

        // expire should NOT be called because 0.30 > 0.05 + 0.0001
        verify(redisTemplate, never()).expire(anyString(), anyLong(), any());
    }

    // -------------------------------------------------------------------------
    // 3. getDailyUsdBigDecimal reads the correct day-scoped key
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getDailyUsdBigDecimal returns value from ai:usage:{userId}:day:{today}:usd")
    void getDailyUsdBigDecimal_readsCorrectKey() {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String expectedKey = RedisUsageCounters.USAGE_KEY_PREFIX + USER_ID + ":day:" + today + ":usd";
        when(valueOps.get(expectedKey)).thenReturn("0.42");

        BigDecimal result = counters.getDailyUsdBigDecimal(USER_ID);

        assertThat(result).isEqualByComparingTo("0.42");
    }

    // -------------------------------------------------------------------------
    // 4. getMonthlyUsdBigDecimal reads the correct month-scoped key
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getMonthlyUsdBigDecimal returns value from ai:usage:{userId}:month:{yyyy-MM}:usd")
    void getMonthlyUsdBigDecimal_readsCorrectKey() {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String expectedKey = RedisUsageCounters.USAGE_KEY_PREFIX + USER_ID + ":month:" + month + ":usd";
        when(valueOps.get(expectedKey)).thenReturn("7.50");

        BigDecimal result = counters.getMonthlyUsdBigDecimal(USER_ID);

        assertThat(result).isEqualByComparingTo("7.50");
    }

    // -------------------------------------------------------------------------
    // 5. getMonthlyTokensRaw / getMonthlyRequestsRaw
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getMonthlyTokensRaw returns parsed long from the tokens key")
    void getMonthlyTokensRaw_returnsCorrectValue() {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String key = RedisUsageCounters.USAGE_KEY_PREFIX + USER_ID + ":month:" + month + ":tokens";
        when(valueOps.get(key)).thenReturn("45000");

        assertThat(counters.getMonthlyTokensRaw(USER_ID)).isEqualTo(45_000L);
    }

    @Test
    @DisplayName("getMonthlyRequestsRaw returns parsed long from the req key")
    void getMonthlyRequestsRaw_returnsCorrectValue() {
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String key = RedisUsageCounters.USAGE_KEY_PREFIX + USER_ID + ":month:" + month + ":req";
        when(valueOps.get(key)).thenReturn("12");

        assertThat(counters.getMonthlyRequestsRaw(USER_ID)).isEqualTo(12L);
    }

    // -------------------------------------------------------------------------
    // 6. Missing Redis key returns zero (first call of the day/month)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Absent Redis key returns 0.0 for USD and 0 for long counters")
    void absentKey_returnsZero() {
        when(valueOps.get(anyString())).thenReturn(null);

        assertThat(counters.getDailyUsdBigDecimal(USER_ID)).isEqualByComparingTo("0.0");
        assertThat(counters.getMonthlyUsdBigDecimal(USER_ID)).isEqualByComparingTo("0.0");
        assertThat(counters.getMonthlyTokensRaw(USER_ID)).isZero();
        assertThat(counters.getMonthlyRequestsRaw(USER_ID)).isZero();
    }

    // -------------------------------------------------------------------------
    // 7. Redis failure is absorbed — no exception propagates to caller
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Redis exception in incrementDoubleWithTtl is swallowed — no propagation")
    void redisFailure_isAbsorbed() {
        when(valueOps.increment(anyString(), anyDouble())).thenThrow(new RuntimeException("Redis down"));

        // Should not throw
        counters.incrementDoubleWithTtl("test:key", 0.10, RedisUsageCounters.USAGE_DAY_TTL_SEC);
    }
}
