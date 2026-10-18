package com.tripplanner.TripPlanner.service;

import java.security.MessageDigest;

/**
 * Interface for AI response caching
 * Implementations: MemoryCacheService (staging) and RedisCacheService (production)
 */
public interface AiCacheService {

    /**
     * Bump when the agent prompt, model, or response schema changes so stale
     * cached bodies miss (entries also expire by TTL / admin evictAll).
     */
    String KEY_VERSION = "v2";

    /** Key for today (UTC: the agent resolves relative dates and forecasts against UTC today). */
    default String cacheKey(String prompt, String language, Object settingsContext) {
        return cacheKey(prompt, language, settingsContext, java.time.LocalDate.now(java.time.ZoneOffset.UTC));
    }

    /**
     * Build the cache key. The cached body embeds fuel prices (fuel type +
     * currency from settingsContext), weather for the departure date and
     * dates resolved from "tomorrow"/"next Saturday", so all of those are in
     * the key: prompt (lowercased, whitespace-collapsed), language, fuel type,
     * currency (absent == the agent defaults petrol/UAH), the UTC day and
     * {@link #KEY_VERSION}. Shared by sync proxy and SSE relay so keys agree.
     */
    default String cacheKey(String prompt, String language, Object settingsContext, java.time.LocalDate day) {
        String fuel = "petrol";
        String currency = "UAH";
        if (settingsContext instanceof java.util.Map<?, ?> m) {
            if (m.get("fuel_type") instanceof String f && !f.isBlank()) fuel = f.trim().toLowerCase();
            if (m.get("currency") instanceof String c && !c.isBlank()) currency = c.trim().toUpperCase();
        }
        String normalized = prompt.toLowerCase().trim().replaceAll("\\s+", " ");
        String raw = String.join("|", KEY_VERSION, day.toString(), language, fuel, currency, normalized);
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is mandatory in every JVM
        }
    }

    /**
     * Get cached response by key
     * @param key Cache key (MD5 hash of prompt + language)
     * @return Cached response or null if not found
     */
    String get(String key);

    /**
     * Store response in cache
     * @param key Cache key
     * @param value Response to cache
     */
    void put(String key, String value);

    /**
     * Remove entry from cache
     * @param key Cache key
     */
    void evict(String key);

    /**
     * Clear all cache entries
     */
    void evictAll();

    /**
     * Get cache implementation type for response headers
     * @return "memory" or "redis"
     */
    String getImplementationType();

    /**
     * Get cache statistics (if supported)
     * @return Cache stats or null if not implemented
     */
    CacheStats getStats();

    /**
     * Cache statistics holder
     */
    class CacheStats {
        private long hitCount;
        private long missCount;
        private long size;

        public CacheStats(long hitCount, long missCount, long size) {
            this.hitCount = hitCount;
            this.missCount = missCount;
            this.size = size;
        }

        public long getHitCount() {
            return hitCount;
        }

        public long getMissCount() {
            return missCount;
        }

        public long getSize() {
            return size;
        }

        public double getHitRate() {
            long total = hitCount + missCount;
            return total == 0 ? 0.0 : (double) hitCount / total;
        }
    }
}
