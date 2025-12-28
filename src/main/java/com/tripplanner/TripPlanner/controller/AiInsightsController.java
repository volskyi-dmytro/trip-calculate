package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.dto.N8nAiResponse;
import com.tripplanner.TripPlanner.dto.RouteParameters;
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

    @Value("${n8n.extractor.url}")
    private String n8nExtractorUrl;

    @Value("${n8n.timeout.seconds:30}")
    private int timeoutSeconds;

    private final RestTemplate restTemplate;
    private final AiCacheService cacheService;
    private final AiUsageService usageService;
    private final ObjectMapper objectMapper;

    /**
     * Constructor initializes RestTemplate with proper timeout configuration
     */
    public AiInsightsController(AiCacheService cacheService, AiUsageService usageService, ObjectMapper objectMapper) {
        this.cacheService = cacheService;
        this.usageService = usageService;
        this.objectMapper = objectMapper;

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
        // Update RestTemplate timeout to use configured value (from properties)
        SimpleClientHttpRequestFactory factory = (SimpleClientHttpRequestFactory) restTemplate.getRequestFactory();
        factory.setReadTimeout(timeoutSeconds * 1000);

        if (n8nWebhookUrl == null || n8nWebhookUrl.isEmpty()) {
            logger.warn("========================================");
            logger.warn("N8N webhook URL is NOT configured!");
            logger.warn("AI insights functionality will be DISABLED");
            logger.warn("Set N8N_WEBHOOK_URL environment variable to enable AI features");
            logger.warn("========================================");
            return;
        }

        // Log configuration (mask URL for security, but show path structure)
        String maskedUrl = n8nWebhookUrl.replaceAll("(https?://[^/]+).*", "$1/***");
        String pathInfo = n8nWebhookUrl.substring(n8nWebhookUrl.indexOf("://") + 3);
        String pathOnly = pathInfo.contains("/") ? pathInfo.substring(pathInfo.indexOf("/")) : "/";
        logger.info("========================================");
        logger.info("AI Insights Controller initialized");
        logger.info("Webhook URL: {}", maskedUrl);
        logger.info("Webhook path structure: {}", pathOnly);
        logger.info("Timeout: {} seconds", timeoutSeconds);
        logger.info("========================================");
    }

    /**
     * Proxy endpoint for AI trip insights
     * Implements two-phase semantic caching:
     * 1. Extract parameters quickly (200ms)
     * 2. Check parameter-based cache
     * 3. Fall back to full N8N workflow if needed
     */
    @PostMapping("/insights")
    public ResponseEntity<?> generateInsights(
            @RequestBody Map<String, String> request,
            HttpServletRequest httpRequest) {

        long startTime = System.currentTimeMillis();
        String prompt = request.get("message");
        String language = request.getOrDefault("language", "en");

        logger.info("AI Insights request - Prompt length: {}, Language: {}", prompt.length(), language);

        if (prompt == null || prompt.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Prompt is required"));
        }

        // Check if N8N webhook is configured
        if (n8nWebhookUrl == null || n8nWebhookUrl.isEmpty()) {
            logger.error("AI insights request received but N8N webhook URL is not configured");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                        "error", "AI insights feature is not available",
                        "details", "Service not configured"
                    ));
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
            } catch (Exception e) {
                logger.warn("Failed to extract user email from authentication", e);
            }
        }

        String clientIp = getClientIp(httpRequest);

        // ============================================================
        // PHASE 1: Try parameter-based cache (semantic caching)
        // ============================================================
        RouteParameters extractedParams = extractParametersOnly(prompt, language);

        if (extractedParams != null && extractedParams.isValid()) {
            String paramCacheKey = generateParameterCacheKey(extractedParams, language);
            String cachedParamResponse = cacheService.get(paramCacheKey);

            if (cachedParamResponse != null) {
                logger.info("✓ SEMANTIC CACHE HIT: {} -> key: {}",
                    extractedParams.toCacheKey(), paramCacheKey);

                // Log cache hit request
                Long logId = usageService.logRequest(userId, userEmail, clientIp, prompt, language);
                long duration = System.currentTimeMillis() - startTime;
                usageService.logResponse(logId, "success_cached", null, duration);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                headers.set("X-Cache-Status", "HIT-SEMANTIC");
                headers.set("X-Cache-Key-Type", "parameter");

                return ResponseEntity.ok()
                        .headers(headers)
                        .body(cachedParamResponse);
            }

            logger.debug("Parameter-based cache MISS: {}", extractedParams.toCacheKey());
        } else {
            logger.debug("Could not extract parameters, skipping parameter-based cache");
        }

        // ============================================================
        // PHASE 2: Try prompt-based cache (backward compatibility)
        // ============================================================
        String promptCacheKey = generateCacheKey(prompt, language);
        String cachedPromptResponse = cacheService.get(promptCacheKey);

        if (cachedPromptResponse != null) {
            logger.info("✓ PROMPT CACHE HIT for length: {}", prompt.length());

            // Log cache hit request
            Long logId = usageService.logRequest(userId, userEmail, clientIp, prompt, language);
            long duration = System.currentTimeMillis() - startTime;
            usageService.logResponse(logId, "success_cached", null, duration);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Cache-Status", "HIT-PROMPT");
            headers.set("X-Cache-Key-Type", "prompt");

            return ResponseEntity.ok()
                    .headers(headers)
                    .body(cachedPromptResponse);
        }

        logger.info("Cache MISS - calling N8N for full response");

        // Log the request
        Long logId = usageService.logRequest(userId, userEmail, clientIp, prompt, language);

        // ============================================================
        // PHASE 3: Cache miss - call full N8N workflow
        // ============================================================
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.add("User-Agent", "TripPlanner-Backend/1.0");

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("message", prompt);
            requestBody.put("language", language);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(n8nWebhookUrl, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                String responseBody = response.getBody();

                // Try to parse as new format with parameters
                try {
                    N8nAiResponse aiResponse = objectMapper.readValue(responseBody, N8nAiResponse.class);

                    if (aiResponse.hasParameters()) {
                        // Store with parameter-based key (semantic caching)
                        String paramCacheKey = generateParameterCacheKey(aiResponse.getParameters(), language);
                        cacheService.put(paramCacheKey, responseBody);
                        logger.info("✓ Cached with PARAMETERS: {} -> Cache key: {}",
                                aiResponse.getParameters().toCacheKey(), paramCacheKey);

                        // Also cache with prompt-based key for backward compatibility
                        cacheService.put(promptCacheKey, responseBody);
                        logger.debug("✓ Also cached with PROMPT key for backward compat");
                    } else {
                        // Old format or no parameters - use prompt-based caching
                        cacheService.put(promptCacheKey, responseBody);
                        logger.info("✓ Cached with PROMPT (no parameters): length={}", prompt.length());
                    }
                } catch (Exception e) {
                    // Failed to parse as new format - treat as raw response
                    cacheService.put(promptCacheKey, responseBody);
                    logger.debug("Response doesn't have parameter structure, using prompt-based caching", e);
                }

                // Log successful response
                long duration = System.currentTimeMillis() - startTime;
                usageService.logResponse(logId, "success", null, duration);

                HttpHeaders responseHeaders = new HttpHeaders();
                responseHeaders.setContentType(MediaType.APPLICATION_JSON);
                responseHeaders.set("X-Cache-Status", "MISS");

                return ResponseEntity.ok()
                        .headers(responseHeaders)
                        .body(responseBody);
            } else {
                logger.error("N8N returned non-2xx status: {}", response.getStatusCode());
                long duration = System.currentTimeMillis() - startTime;
                usageService.logResponse(logId, "error", "N8N returned " + response.getStatusCode(), duration);
                return ResponseEntity
                        .status(response.getStatusCode())
                        .body(Map.of("error", "N8N workflow failed", "status", response.getStatusCode().toString()));
            }

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            logger.error("Failed to call N8N workflow", e);
            usageService.logResponse(logId, "error", e.getMessage(), duration);

            return ResponseEntity
                    .status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to generate route", "message", e.getMessage()));
        }
    }

    /**
     * Quickly extract route parameters without full geocoding/processing.
     * Calls lightweight N8N workflow that only returns parameters.
     *
     * @param prompt User's route request
     * @param language Language code (en/uk)
     * @return RouteParameters if successful, null if extraction failed
     */
    private RouteParameters extractParametersOnly(String prompt, String language) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.add("User-Agent", "TripPlanner-Backend/1.0");

            Map<String, Object> requestBody = Map.of(
                "message", prompt,
                "language", language
            );

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            // Set shorter timeout for parameter extraction (500ms)
            RestTemplate fastRestTemplate = new RestTemplate();
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(500);
            factory.setReadTimeout(500);
            fastRestTemplate.setRequestFactory(factory);

            logger.debug("Calling N8N parameter extractor at: {}", n8nExtractorUrl);
            ResponseEntity<String> response = fastRestTemplate.postForEntity(
                n8nExtractorUrl, request, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                JsonNode root = objectMapper.readTree(response.getBody());

                if (root.path("success").asBoolean(false)) {
                    JsonNode paramsNode = root.path("parameters");

                    if (!paramsNode.isMissingNode()) {
                        RouteParameters params = objectMapper.treeToValue(paramsNode, RouteParameters.class);
                        logger.debug("✓ Extracted parameters: {}", params.toCacheKey());
                        return params;
                    }
                } else {
                    logger.debug("Parameter extraction returned success=false: {}",
                        root.path("error").asText("unknown error"));
                }
            }

        } catch (Exception e) {
            // Timeout or other errors - this is OK, we'll fall back to full workflow
            if (e.getMessage() != null && e.getMessage().contains("timed out")) {
                logger.debug("Parameter extraction timed out (this is OK, will use full workflow)");
            } else {
                logger.debug("Failed to extract parameters: {} (will fall back to prompt-based cache)",
                    e.getMessage());
            }
        }

        return null;
    }

    /**
     * Generate cache key from prompt and language
     * Uses MD5 hash of normalized prompt
     * LEGACY METHOD - kept for backward compatibility
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
     * Generate cache key from extracted parameters
     * This provides semantic caching - similar trips cache together regardless of phrasing
     *
     * Examples:
     * - "Trip from Kyiv to Lviv" + "Поїздка з Києва до Львова" -> SAME cache key
     * - "2 passengers" + "двох пасажирів" -> SAME cache key
     *
     * @param parameters Extracted route parameters from N8N
     * @param language Language code
     * @return MD5 hash of normalized parameters
     */
    private String generateParameterCacheKey(RouteParameters parameters, String language) {
        try {
            // Get normalized parameter string (e.g., "kyiv->lviv|p2")
            String paramString = parameters.toCacheKey();
            String input = paramString + "|" + language;

            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hashBytes = md.digest(input.getBytes());

            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }

            logger.debug("Parameter cache key: {} -> {}", paramString, sb.toString());
            return sb.toString();

        } catch (Exception e) {
            logger.error("Failed to generate parameter cache key, falling back to prompt-based", e);
            // Fallback to simple hash
            return String.valueOf((parameters.toCacheKey() + language).hashCode());
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
