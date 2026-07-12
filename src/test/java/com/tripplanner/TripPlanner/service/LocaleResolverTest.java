package com.tripplanner.TripPlanner.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LocaleResolverTest {

    private final LocaleResolver resolver = new LocaleResolver();

    @Test
    void fallsBackToUkrainianWhenHeaderMissing() {
        assertEquals("uk", resolver.resolve(null));
        assertEquals("uk", resolver.resolve(""));
    }

    @Test
    void fallsBackToUkrainianWhenEnglishIsNotPresent() {
        assertEquals("uk", resolver.resolve("uk-UA,uk;q=0.9"));
        assertEquals("uk", resolver.resolve("fr-FR,fr;q=0.9,de;q=0.8"));
    }

    @Test
    void picksEnglishWhenItRanksAheadOfUkrainian() {
        assertEquals("en", resolver.resolve("en-US,en;q=0.9,uk;q=0.8"));
    }

    @Test
    void picksUkrainianWhenItRanksAheadOfEnglish() {
        assertEquals("uk", resolver.resolve("uk-UA,uk;q=0.9,en;q=0.8"));
    }
}
