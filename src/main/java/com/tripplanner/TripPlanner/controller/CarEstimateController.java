package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Authenticated proxy to the agent's `/estimate-car` endpoint, guarded by a
 * per-user rate limiter (5/min, 20/hour) and a 24h response cache keyed by
 * normalized description. Mirrors WeatherProxyController's HTTP/1.1-pinned
 * client pattern, but unlike weather this is user-visible and error-bearing
 * (rate limits and unknown-car results are not advisory).
 */
@RestController
@RequestMapping("/api/cars")
public class CarEstimateController {

    private static final Logger logger = LoggerFactory.getLogger(CarEstimateController.class);
    private static final Set<String> FUEL_TYPES = Set.of("petrol", "diesel", "lpg");
    private static final int MINUTE_LIMIT = 5;
    private static final int HOUR_LIMIT = 20;
    private static final long CACHE_TTL_SECONDS = 24 * 3600;
    private static final int CACHE_MAX_SIZE = 1000;

    @Value("${agent.url:}")
    private String agentUrl;

    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final HttpClient httpClient;
    private final ConcurrentHashMap<String, UserWindow> windows = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CachedEstimate> cache = new ConcurrentHashMap<>();

    // @Autowired is required: with two constructors and no annotation, Spring
    // cannot pick one and falls back to a (nonexistent) default constructor,
    // failing servlet startup. Unit tests instantiate directly and never see this.
    @Autowired
    public CarEstimateController(ObjectMapper objectMapper) { this(objectMapper, Clock.systemUTC()); }

    CarEstimateController(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock;
        // HTTP/1.1 pinned: uvicorn drops POST bodies on h2c upgrade
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @PostMapping("/estimate")
    public ResponseEntity<?> estimate(@RequestBody EstimateRequest request,
                                      @AuthenticationPrincipal OAuth2User principal) {
        String description = request.description() == null ? "" : request.description().trim();
        if (description.isEmpty() || description.length() > 200) {
            return status(400, "invalid_description");
        }
        String language = "uk".equals(request.language()) ? "uk" : "en";
        String cacheKey = description.toLowerCase().replaceAll("\\s+", " ");

        CachedEstimate cached = cache.get(cacheKey);
        long now = clock.instant().getEpochSecond();
        if (cached != null && now - cached.insertedAt < CACHE_TTL_SECONDS) {
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(cached.body);
        }
        String userKey = principal.getAttribute("sub");
        if (!tryConsume(userKey, now)) {
            return status(429, "rate_limited");
        }
        if (agentUrl == null || agentUrl.isEmpty()) {
            return status(503, "estimate_unavailable");
        }
        try {
            String agentBody = callAgent(objectMapper.writeValueAsString(
                    Map.of("description", description, "language", language)));
            JsonNode node = objectMapper.readTree(agentBody);
            if (node.path("unknown").asBoolean(false)) {
                return status(422, "unknown_car");
            }
            double consumption = node.path("consumptionL100km").asDouble(0);
            String fuelType = node.path("fuelType").asText(null);
            if (consumption < 3.0 || consumption > 25.0 || fuelType == null
                    || !FUEL_TYPES.contains(fuelType)) {
                return status(422, "unknown_car");
            }
            String body = objectMapper.writeValueAsString(Map.of(
                    "makeModel", node.path("makeModel").asText(""),
                    "fuelType", fuelType,
                    "consumptionL100km", consumption));
            if (cache.size() >= CACHE_MAX_SIZE) {
                cache.entrySet().removeIf(e -> now - e.getValue().insertedAt >= CACHE_TTL_SECONDS);
                if (cache.size() >= CACHE_MAX_SIZE) cache.clear();
            }
            cache.put(cacheKey, new CachedEstimate(body, now));
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return status(503, "estimate_unavailable");
        } catch (Exception e) {
            logger.warn("car estimate agent unreachable: {}", e.getClass().getSimpleName());
            return status(503, "estimate_unavailable");
        }
    }

    /** Package-visible hook so tests can stub the agent call. */
    String callAgent(String jsonBody) throws IOException, InterruptedException {
        HttpRequest agentRequest = HttpRequest.newBuilder()
                .uri(URI.create(agentUrl + "/estimate-car"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();
        HttpResponse<String> response = httpClient.send(agentRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IOException("agent returned " + response.statusCode());
        return response.body();
    }

    private boolean tryConsume(String userKey, long now) {
        UserWindow w = windows.computeIfAbsent(userKey, k -> new UserWindow());
        synchronized (w) {
            if (now - w.minuteStart >= 60) { w.minuteStart = now; w.minuteCount = 0; }
            if (now - w.hourStart >= 3600) { w.hourStart = now; w.hourCount = 0; }
            if (w.minuteCount >= MINUTE_LIMIT || w.hourCount >= HOUR_LIMIT) return false;
            w.minuteCount++;
            w.hourCount++;
            return true;
        }
    }

    private static ResponseEntity<String> status(int code, String error) {
        return ResponseEntity.status(code)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":\"" + error + "\"}");
    }

    private static class UserWindow { long minuteStart; int minuteCount; long hourStart; int hourCount; }
    private record CachedEstimate(String body, long insertedAt) {}

    public record EstimateRequest(String description, String language) {}
}
