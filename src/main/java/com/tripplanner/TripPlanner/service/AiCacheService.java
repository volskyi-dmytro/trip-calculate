package com.tripplanner.TripPlanner.service;

import java.security.MessageDigest;

/**
 * Interface for AI response caching
 * Implementations: MemoryCacheService (staging) and RedisCacheService (production)
 */
public interface AiCacheService {

    /**
     * Build the cache key for a prompt + language pair.
     * MD5 hash of the normalized prompt (lowercased, trimmed, whitespace-collapsed)
     * concatenated with the language, falling back to a plain hashCode if MD5
     * is unavailable. Shared by every caller (sync proxy, SSE relay) so cache
     * keys always agree regardless of entry point.
     */
    default String cacheKey(String prompt, String language) {
        try {
            String normalized = prompt.toLowerCase().trim().replaceAll("\\s+", " ");
            byte[] hash = MessageDigest.getInstance("MD5").digest((normalized + "|" + language).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf((prompt + language).hashCode());
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
