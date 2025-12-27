package com.tripplanner.TripPlanner.controller;

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
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * Backend proxy controller for AI-powered trip insights via n8n webhook
 * Provides rate limiting, caching, and usage monitoring for Gemini API calls
 */
@RestController
@RequestMapping("/api/ai")
public class AiInsightsController {

    private static final Logger logger = LoggerFactory.getLogger(AiInsightsController.class);

    @Value("${n8n.webhook.url}")
    private String n8nWebhookUrl;

    @Value("${n8n.timeout.seconds:30}")
    private int timeoutSeconds;

    private final RestTemplate restTemplate;
    private final AiCacheService cacheService;
    private final AiUsageService usageService;

    /**
     * Constructor initializes RestTemplate with proper timeout configuration
     */
    public AiInsightsController(AiCacheService cacheService, AiUsageService usageService) {
        this.cacheService = cacheService;
        this.usageService = usageService;

        // Configure RestTemplate with connection and read timeouts
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);  // 5 seconds to establish connection
        factory.setReadTimeout(30000);     // 30 seconds to read response (LLM can be slow)

        this.restTemplate = new RestTemplate(factory);
    }

    /**
     * Validates configuration on startup
     */
    @PostConstruct
    public void validateConfiguration() {
        if (n8nWebhookUrl == null || n8nWebhookUrl.isEmpty()) {
            throw new IllegalStateException(
                "n8n.webhook.url must be configured. Set N8N_WEBHOOK_URL environment variable."
            );
        }

        // Update RestTemplate timeout to use configured value (from properties)
        SimpleClientHttpRequestFactory factory = (SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();
        factory.setReadTimeout(timeoutSeconds * 1000);

        // Log configuration (mask URL for security)
        String maskedUrl = n8nWebhookUrl.replaceAll("(https?://[^/]+).*", "$1/***");
        logger.info("AI Insights Controller initialized with webhook: {}", maskedUrl);
        logger.info("AI Insights timeout configured: {} seconds", timeoutSeconds);
    }

    /**
     * Proxy endpoint for AI trip insights
     * Handles caching, logging, and proxying requests to n8n webhook
     */
    @PostMapping("/insights")
    public ResponseEntity<?> generateInsights(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {

        long startTime = System.currentTimeMillis();
        String prompt = request.get("message");
        String language = request.getOrDefault("language", "en");

        if (prompt == null || prompt.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Prompt is required"));
        }

        // Get user info for logging
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Long userId = null;
        String userEmail = null;
        boolean isAuthenticated = auth != null && auth.isAuthenticated()
                && !auth.getPrincipal().equals("anonymousUser");

        if (isAuthenticated) {
            try {
                org.springframework.security.oauth2.core.user.OAuth2User oAuth2User =
                    (org.springframework.security.oauth2.core.user.OAuth2User) auth.getPrincipal();
                userEmail = oAuth2User.getAttribute("email");
                // We'll fetch userId in the service layer
            } catch (Exception e) {
                logger.warn("Failed to extract user email from authentication", e);
            }
        }

        String clientIp = getClientIp(httpRequest);

        // Generate cache key
        String cacheKey = generateCacheKey(prompt, language);

        // Check cache first
        String cachedResponse = cacheService.get(cacheKey);
        if (cachedResponse != null) {
            logger.info("Cache HIT for prompt length: {}", prompt.length());

            // Log cache hit request
            Long logId = usageService.logRequest(userId, userEmail, clientIp, prompt, language);
            long duration = System.currentTimeMillis() - startTime;
            usageService.logResponse(logId, "success_cached", null, duration);

            // Return cached response with cache headers
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Cache", "HIT");
            headers.add("X-Cache-Implementation", cacheService.getImplementationType());

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(cachedResponse);
        }

        logger.info("Cache MISS for prompt length: {}", prompt.length());

        // Log the request
        Long logId = usageService.logRequest(userId, userEmail, clientIp, prompt, language);

        try {
            // Proxy request to n8n webhook
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(request, headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    n8nWebhookUrl,
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            String responseBody = response.getBody();
            long duration = System.currentTimeMillis() - startTime;

            // Cache the successful response
            if (responseBody != null && response.getStatusCode().is2xxSuccessful()) {
                cacheService.put(cacheKey, responseBody);
                logger.info("Cached response for prompt length: {}", prompt.length());
            }

            // Log successful response
            usageService.logResponse(logId, "success", null, duration);

            // Add cache headers
            HttpHeaders responseHeaders = new HttpHeaders();
            responseHeaders.add("X-Cache", "MISS");
            responseHeaders.add("X-Cache-Implementation", cacheService.getImplementationType());

            return ResponseEntity.ok()
                    .headers(responseHeaders)
                    .body(responseBody);

        } catch (HttpClientErrorException | HttpServerErrorException e) {
            long duration = System.currentTimeMillis() - startTime;
            String errorMsg = String.format("N8N API error: %s %s", e.getStatusCode(), e.getStatusText());
            logger.error(errorMsg, e);

            usageService.logResponse(logId, "error", errorMsg, duration);

            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", "AI service temporarily unavailable"));

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            logger.error("Failed to proxy request to n8n", e);

            usageService.logResponse(logId, "error", e.getMessage(), duration);

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to process AI request"));
        }
    }

    /**
     * Generate cache key from prompt and language
     * Uses MD5 hash of normalized prompt
     */
    private String generateCacheKey(String prompt, String language) {
        try {
            String normalized = prompt.toLowerCase().trim().replaceAll("\\s+", " ");
            String input = normalized + "|" + language;

            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hashBytes = md.digest(input.getBytes());

            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();

        } catch (Exception e) {
            logger.error("Failed to generate cache key, using fallback", e);
            return String.valueOf((prompt + language).hashCode());
        }
    }

    /**
     * Extract client IP address from request, considering proxy headers
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
