package com.tripplanner.TripPlanner.service;

/**
 * Interface for AI response caching
 * Implementations: MemoryCacheService (staging) and RedisCacheService (production)
 */
public interface AiCacheService {

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
