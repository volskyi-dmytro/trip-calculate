package com.tripplanner.TripPlanner.ai.controller;

import com.tripplanner.TripPlanner.ai.access.AiAccessFilter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * M1 acceptance endpoint: GET /api/ai/ping
 *
 * Returns:
 * {
 *   "ok": true,
 *   "sub": "<userId>",
 *   "dailyUsdRemaining": <double>,
 *   "monthlyUsdRemaining": <double>
 * }
 *
 * The aiUserId request attribute is set by AiAccessFilter, which runs before this
 * controller.  If the filter rejected the request this endpoint is never reached.
 *
 * dailyUsdRemaining and monthlyUsdRemaining report how much of the grant cap is
 * left.  The caps are read from Redis usage counters — they may be 0.0 if Redis
 * is unavailable (fail-open for observability, not for access).
 */
@RestController
@RequestMapping("/api/ai")
@Slf4j
public class AiPingController {

    private static final String USAGE_KEY_PREFIX = "ai:usage:";
    // These cap values are not available in the ping controller without a full grant lookup.
    // We show remaining as Double.MAX_VALUE when cap == 0 (uncapped).
    private static final double UNCAPPED = -1.0;

    private final RedisTemplate<String, String> redisTemplate;

    public AiPingController(RedisTemplate<String, String> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/ping")
    public ResponseEntity<Map<String, Object>> ping(HttpServletRequest request) {
        String userId = (String) request.getAttribute(AiAccessFilter.AI_USER_ID_ATTRIBUTE);
        // If AiAccessFilter is not in the chain (tests, dev profile), fall back gracefully.
        if (userId == null) {
            userId = "unknown";
        }

        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        String month = YearMonth.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));

        double dailyUsdSpent   = readDouble(USAGE_KEY_PREFIX + userId + ":day:" + today + ":usd");
        double monthlyUsdSpent = readDouble(USAGE_KEY_PREFIX + userId + ":month:" + month + ":usd");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("sub", userId);
        // Report raw spent amounts; cap values require a grant lookup not wired into this controller.
        // Frontend can display these as "used so far" until M3 wires the full cap response.
        body.put("dailyUsdSpent", dailyUsdSpent);
        body.put("monthlyUsdSpent", monthlyUsdSpent);
        // Sentinel for "we don't know the cap from this endpoint" — M3 will enrich this.
        body.put("dailyUsdRemaining", UNCAPPED);
        body.put("monthlyUsdRemaining", UNCAPPED);

        log.debug("AI ping for userId [{}]: dailySpent={}, monthlySpent={}", userId, dailyUsdSpent, monthlyUsdSpent);
        return ResponseEntity.ok(body);
    }

    private double readDouble(String key) {
        try {
            String val = redisTemplate.opsForValue().get(key);
            return val != null ? Double.parseDouble(val) : 0.0;
        } catch (Exception e) {
            log.warn("Failed to read usage counter from Redis key [{}]: {}", key, e.getMessage());
            return 0.0;
        }
    }
}
