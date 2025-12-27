package com.tripplanner.TripPlanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory cache implementation for AI responses (staging environment)
 * Uses ConcurrentHashMap with TTL and LRU eviction
 */
@Service
@Profile({"staging", "dev", "default"})
public class MemoryCacheService implements AiCacheService {

    private static final Logger logger = LoggerFactory.getLogger(MemoryCacheService.class);

    @Value("${ai.cache.ttl.hours:24}")
    private int ttlHours;

    @Value("${ai.cache.max.size:500}")
    private int maxSize;

    private final Map<String, CachedEntry> cache = new ConcurrentHashMap<>();
    private final AtomicLong hitCount = new AtomicLong(0);
    private final AtomicLong missCount = new AtomicLong(0);

    @Override
    public String get(String key) {
        CachedEntry entry = cache.get(key);

        if (entry == null) {
            missCount.incrementAndGet();
            logger.debug("Cache MISS: key={}", key);
            return null;
        }

        // Check if expired
        if (entry.isExpired(ttlHours)) {
            cache.remove(key);
            missCount.incrementAndGet();
            logger.debug("Cache EXPIRED: key={}", key);
            return null;
        }

        entry.incrementHitCount();
        entry.updateLastAccessed();
        hitCount.incrementAndGet();
        logger.debug("Cache HIT: key={}, hits={}", key, entry.getHitCount());

        return entry.getValue();
    }

    @Override
    public void put(String key, String value) {
        // Enforce max size with LRU eviction
        if (cache.size() >= maxSize) {
            evictLRU();
        }

        CachedEntry entry = new CachedEntry(value);
        cache.put(key, entry);
        logger.debug("Cache PUT: key={}, size={}", key, cache.size());
    }

    @Override
    public void evict(String key) {
        cache.remove(key);
        logger.debug("Cache EVICT: key={}", key);
    }

    @Override
    public void evictAll() {
        int size = cache.size();
        cache.clear();
        hitCount.set(0);
        missCount.set(0);
        logger.info("Cache CLEAR: evicted {} entries", size);
    }

    @Override
    public String getImplementationType() {
        return "memory";
    }

    @Override
    public CacheStats getStats() {
        return new CacheStats(hitCount.get(), missCount.get(), cache.size());
    }

    /**
     * Evict least recently used entries when cache is full
     */
    private void evictLRU() {
        if (cache.isEmpty()) {
            return;
        }

        // Find oldest entry by last access time
        String oldestKey = null;
        LocalDateTime oldestTime = LocalDateTime.now();

        for (Map.Entry<String, CachedEntry> entry : cache.entrySet()) {
            if (entry.getValue().getLastAccessed().isBefore(oldestTime)) {
                oldestTime = entry.getValue().getLastAccessed();
                oldestKey = entry.getKey();
            }
        }

        if (oldestKey != null) {
            cache.remove(oldestKey);
            logger.debug("Cache LRU EVICT: key={}", oldestKey);
        }
    }

    /**
     * Cached entry with metadata
     */
    private static class CachedEntry {
        private final String value;
        private final LocalDateTime cachedAt;
        private LocalDateTime lastAccessed;
        private int hitCount;

        CachedEntry(String value) {
            this.value = value;
            this.cachedAt = LocalDateTime.now();
            this.lastAccessed = LocalDateTime.now();
            this.hitCount = 0;
        }

        String getValue() {
            return value;
        }

        LocalDateTime getCachedAt() {
            return cachedAt;
        }

        LocalDateTime getLastAccessed() {
            return lastAccessed;
        }

        void updateLastAccessed() {
            this.lastAccessed = LocalDateTime.now();
        }

        int getHitCount() {
            return hitCount;
        }

        void incrementHitCount() {
            this.hitCount++;
        }

        boolean isExpired(int ttlHours) {
            return LocalDateTime.now().isAfter(cachedAt.plusHours(ttlHours));
        }
    }
}
