package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.dto.AgentResponse;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.security.MessageDigest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiInsightsController {

    private static final Logger logger = LoggerFactory.getLogger(AiInsightsController.class);

    // Bounds per-request token cost; the agent's ParseRouteRequest schema
    // enforces the same limits for callers that bypass this proxy
    private static final int MAX_MESSAGE_LENGTH = 500;
    private static final int MAX_CURRENT_ROUTE_WAYPOINTS = 25;

    @Value("${agent.url:}")
    private String agentUrl;

    @Value("${agent.timeout.seconds:30}")
    private int timeoutSeconds;

    private final RestTemplate restTemplate;
    private final AiCacheService cacheService;
    private final AiUsageService usageService;
    private final ObjectMapper objectMapper;

    public AiInsightsController(AiCacheService cacheService, AiUsageService usageService,
                                ObjectMapper objectMapper) {
        this.cacheService = cacheService;
        this.usageService = usageService;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(factory);
    }

    @PostConstruct
    public void validateConfiguration() {
        SimpleClientHttpRequestFactory factory = (SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();
        factory.setReadTimeout(timeoutSeconds * 1000);

        if (agentUrl == null || agentUrl.isEmpty()) {
            logger.warn("AGENT_URL is not configured — AI route planning is disabled");
            return;
        }
        logger.info("AI route planning enabled → {}", agentUrl.replaceAll("(https?://[^/]+).*", "$1/***"));
    }

    @PostMapping("/insights")
    public ResponseEntity<?> generateInsights(
            @RequestBody Map<String, Object> request,
            HttpServletRequest httpRequest) {

        long startTime = System.currentTimeMillis();
        String prompt = request.get("message") instanceof String s ? s : null;
        String language = request.get("language") instanceof String l ? l : "en";
        List<?> currentRoute = request.get("currentRoute") instanceof List<?> route ? route : List.of();

        if (prompt == null || prompt.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Prompt is required"));
        }

        if (prompt.length() > MAX_MESSAGE_LENGTH) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Message too long (max " + MAX_MESSAGE_LENGTH + " characters)"));
        }

        if (currentRoute.size() > MAX_CURRENT_ROUTE_WAYPOINTS) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Current route too large (max " + MAX_CURRENT_ROUTE_WAYPOINTS + " waypoints)"));
        }

        if (agentUrl == null || agentUrl.isEmpty()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "AI route planning is not configured"));
        }

        String userEmail = extractUserEmail();
        String clientIp = getClientIp(httpRequest);

        // Cache check — skipped for modification requests: their answer
        // depends on the caller's current route, so replaying it to another
        // user (or the same user with a different route) would be wrong
        boolean cacheable = currentRoute.isEmpty();
        String cacheKey = generateCacheKey(prompt, language);
        String cached = cacheable ? cacheService.get(cacheKey) : null;
        if (cached != null) {
            logger.info("Cache HIT for prompt length={}", prompt.length());
            Long logId = usageService.logRequest(null, userEmail, clientIp, prompt, language);
            usageService.logResponse(logId, "success_cached", null, System.currentTimeMillis() - startTime);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Cache-Status", "HIT");
            return ResponseEntity.ok().headers(headers).body(cached);
        }

        Long logId = usageService.logRequest(null, userEmail, clientIp, prompt, language);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.add("User-Agent", "TripPlanner-Backend/1.0");

            Map<String, Object> body = new HashMap<>();
            body.put("message", prompt);
            body.put("language", language);
            body.put("user_id", userEmail != null ? userEmail : "anonymous");
            if (!currentRoute.isEmpty()) {
                // Shape validation is the agent's job (CurrentWaypoint schema)
                body.put("current_route", currentRoute);
            }

            // The user's fuel type + display currency, so the agent's fuel
            // node prices the right fuel in the right currency
            if (request.get("settingsContext") instanceof Map<?, ?> settingsContext) {
                body.put("settings_context", settingsContext);
            }

            ResponseEntity<String> response = restTemplate.postForEntity(
                    agentUrl + "/parse-route",
                    new HttpEntity<>(body, headers),
                    String.class
            );

            if (response.getStatusCode().is2xxSuccessful()) {
                String responseBody = response.getBody();
                long duration = System.currentTimeMillis() - startTime;

                // Only cache responses the agent itself marks as valid — caching a
                // success=false body would replay a transient geocoding failure
                // to every user asking the same question for the cache TTL.
                AgentResponse agentResponse = parseAgentResponse(responseBody);
                if (agentResponse != null && agentResponse.isValid()) {
                    if (cacheable) {
                        cacheService.put(cacheKey, responseBody);
                    }
                    usageService.logResponse(logId, "success", null, duration);
                } else {
                    String agentError = agentResponse != null ? agentResponse.getError() : "unparseable response";
                    usageService.logResponse(logId, "agent_error", agentError, duration);
                    logger.info("Agent returned non-cacheable response: {}", agentError);
                }
                logger.info("Agent call succeeded in {}ms", duration);

                HttpHeaders responseHeaders = new HttpHeaders();
                responseHeaders.setContentType(MediaType.APPLICATION_JSON);
                responseHeaders.set("X-Cache-Status", "MISS");
                return ResponseEntity.ok().headers(responseHeaders).body(responseBody);
            }

            logger.error("Agent returned non-2xx: {}", response.getStatusCode());
            usageService.logResponse(logId, "error", "Agent returned " + response.getStatusCode(),
                    System.currentTimeMillis() - startTime);
            return ResponseEntity.status(response.getStatusCode())
                    .body(Map.of("error", "Agent call failed"));

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            logger.error("Failed to call agent", e);
            usageService.logResponse(logId, "error", e.getMessage(), duration);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to generate route", "message", e.getMessage()));
        }
    }

    private AgentResponse parseAgentResponse(String body) {
        if (body == null || body.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.readValue(body, AgentResponse.class);
        } catch (Exception e) {
            logger.warn("Could not parse agent response: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    private String extractUserEmail() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
                var oAuth2User = (org.springframework.security.oauth2.core.user.OAuth2User) auth.getPrincipal();
                return oAuth2User.getAttribute("email");
            }
        } catch (Exception e) {
            logger.debug("Could not extract user email", e);
        }
        return null;
    }

    private String generateCacheKey(String prompt, String language) {
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

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        return (xff != null && !xff.isEmpty()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
    }
}
