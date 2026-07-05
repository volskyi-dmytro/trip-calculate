package com.tripplanner.TripPlanner.service;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Slugs are the only key protecting anonymous receipts from enumeration,
 * so length and alphabet are load-bearing security properties.
 */
class SlugGeneratorTest {

    private final SlugGenerator generator = new SlugGenerator();

    @Test
    void producesEightBase62Chars() {
        for (int i = 0; i < 100; i++) {
            String slug = generator.next();
            assertEquals(8, slug.length());
            assertTrue(slug.matches("[0-9A-Za-z]{8}"), "unexpected char in: " + slug);
        }
    }

    @Test
    void producesDistinctValues() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            seen.add(generator.next());
        }
        assertEquals(1000, seen.size());
    }
}
