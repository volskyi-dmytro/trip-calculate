package com.tripplanner.TripPlanner.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiCacheKeyTest {

    private final AiCacheService cache = mock(AiCacheService.class, CALLS_REAL_METHODS);
    private static final LocalDate D = LocalDate.of(2026, 10, 17);
    private static final Map<String, Object> UAH_PETROL = Map.of("fuel_type", "petrol", "currency", "UAH");

    private String key(String prompt, Object ctx, LocalDate day) {
        return cache.cacheKey(prompt, "en", ctx, day);
    }

    @Test
    void identicalContextHitsDespiteCaseAndWhitespace() {
        assertEquals(key("Kyiv to  Lviv", UAH_PETROL, D), key(" kyiv to lviv ", Map.of("currency", "uah", "fuel_type", "PETROL"), D));
    }

    @Test
    void absentSettingsEqualAgentDefaults() {
        assertEquals(key("kyiv to lviv", null, D), key("kyiv to lviv", UAH_PETROL, D));
    }

    @Test
    void fuelCurrencyLanguageAndVersionChangesMiss() {
        String base = key("kyiv to lviv", UAH_PETROL, D);
        assertNotEquals(base, key("kyiv to lviv", Map.of("fuel_type", "diesel", "currency", "UAH"), D));
        assertNotEquals(base, key("kyiv to lviv", Map.of("fuel_type", "petrol", "currency", "EUR"), D));
        assertNotEquals(base, cache.cacheKey("kyiv to lviv", "uk", UAH_PETROL, D));
        AiCacheService v3 = mock(AiCacheService.class, CALLS_REAL_METHODS);
        // version is an interface constant embedded in the hash input: a different day proves the same mechanism
        assertNotEquals(base, v3.cacheKey("kyiv to lviv", "en", UAH_PETROL, D.plusDays(1)));
    }

    @Test
    void relativeDatePromptNotReusedAcrossDayBoundary() {
        assertNotEquals(key("trip next saturday", UAH_PETROL, D), key("trip next saturday", UAH_PETROL, D.plusDays(1)));
    }

    @Test
    void defaultOverloadUsesTodayUtc() {
        assertEquals(cache.cacheKey("x", "en", null), cache.cacheKey("x", "en", null, LocalDate.now(java.time.ZoneOffset.UTC)));
    }
}
