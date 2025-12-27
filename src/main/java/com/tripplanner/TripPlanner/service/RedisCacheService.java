package com.tripplanner.TripPlanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * Redis-based cache implementation for AI responses (production environment)
 * Provides persistent, scalable caching with TTL support
 */
@Service
@Profile("prod")
public class RedisCacheService implements AiCacheService {

    private static final Logger logger = LoggerFactory.getLogger(RedisCacheService.class);
    private static final String KEY_PREFIX = "ai:cache:";

    @Value("${ai.cache.ttl.hours:24}")
    private int ttlHours;

    private final RedisTemplate<String, String> redisTemplate;

    public RedisCacheService(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
        logger.info("RedisCacheService initialized with TTL: {} hours", ttlHours);
    }

    @Override
    public String get(String key) {
        try {
            String fullKey = KEY_PREFIX + key;
            String value = redisTemplate.opsForValue().get(fullKey);

            if (value != null) {
                logger.debug("Redis Cache HIT: key={}", key);
            } else {
                logger.debug("Redis Cache MISS: key={}", key);
            }

            return value;

        } catch (Exception e) {
            logger.error("Redis GET error for key: {}", key, e);
            return null;
        }
    }

    @Override
    public void put(String key, String value) {
        try {
            String fullKey = KEY_PREFIX + key;
            redisTemplate.opsForValue().set(fullKey, value, ttlHours, TimeUnit.HOURS);
            logger.debug("Redis Cache PUT: key={}, ttl={}h", key, ttlHours);

        } catch (Exception e) {
            logger.error("Redis PUT error for key: {}", key, e);
        }
    }

    @Override
    public void evict(String key) {
        try {
            String fullKey = KEY_PREFIX + key;
            redisTemplate.delete(fullKey);
            logger.debug("Redis Cache EVICT: key={}", key);

        } catch (Exception e) {
            logger.error("Redis EVICT error for key: {}", key, e);
        }
    }

    @Override
    public void evictAll() {
        try {
            String pattern = KEY_PREFIX + "*";
            long deletedCount = 0;

            // Use SCAN instead of KEYS for production safety (KEYS blocks Redis)
            var scanOptions = org.springframework.data.redis.core.ScanOptions.scanOptions()
                    .match(pattern)
                    .count(100)
                    .build();

            try (var cursor = redisTemplate.scan(scanOptions)) {
                while (cursor.hasNext()) {
                    String key = cursor.next();
                    redisTemplate.delete(key);
                    deletedCount++;
                }
            }

            logger.info("Redis Cache CLEAR: evicted {} keys", deletedCount);

        } catch (Exception e) {
            logger.error("Redis EVICT_ALL error", e);
        }
    }

    @Override
    public String getImplementationType() {
        return "redis";
    }

    @Override
    public CacheStats getStats() {
        try {
            String pattern = KEY_PREFIX + "*";
            var keys = redisTemplate.keys(pattern);
            long size = keys != null ? keys.size() : 0;

            // Note: Hit/miss counts not tracked in this implementation
            // Could be added using Redis INCR commands if needed
            return new CacheStats(0, 0, size);

        } catch (Exception e) {
            logger.error("Redis GET_STATS error", e);
            return new CacheStats(0, 0, 0);
        }
    }
}
