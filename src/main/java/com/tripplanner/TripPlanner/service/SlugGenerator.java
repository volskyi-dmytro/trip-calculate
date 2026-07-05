package com.tripplanner.TripPlanner.service;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Generates unguessable 8-char base62 slugs for public receipt URLs.
 * 62^8 ≈ 2.18e14 — enumeration is infeasible at our rate limits.
 */
@Component
public class SlugGenerator {

    private static final String ALPHABET =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int LENGTH = 8;

    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
