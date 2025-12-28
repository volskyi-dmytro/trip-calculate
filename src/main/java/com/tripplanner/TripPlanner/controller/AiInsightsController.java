package com.tripplanner.TripPlanner.controller;

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
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.security.MessageDigest;
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
                // We'll fetch userId in the service layer
            } catch (Exception e) {
                logger.warn("Failed to extract user email from authentication", e);
            }
        }

        String clientIp = getClientIp(httpRequest);

        // Generate initial cache key from prompt (for backward compatibility)
        // This will be updated if N8N returns parameters
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
            headers.set("Accept", "*/*");
            // Set a simple User-Agent to avoid any potential N8N filtering
            headers.set("User-Agent", "TripPlanner-Backend/1.0");

            HttpEntity<Map<String, String>> entity = new HttpEntity<>(request, headers);

            logger.info("Calling N8N webhook - Prompt length: {}, Language: {}", prompt.length(), language);
            logger.debug("Full request payload: {}", request);
            logger.debug("Request headers: {}", headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    n8nWebhookUrl,
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            logger.info("N8N webhook response status: {}", response.getStatusCode());

            String responseBody = response.getBody();
            long duration = System.currentTimeMillis() - startTime;

            if (responseBody != null && response.getStatusCode().is2xxSuccessful()) {
                // Try to parse as new format with parameters
                try {
                    N8nAiResponse aiResponse = objectMapper.readValue(responseBody, N8nAiResponse.class);

                    if (aiResponse.hasParameters()) {
                        // Use parameter-based cache key for better semantic caching
                        String paramCacheKey = generateParameterCacheKey(aiResponse.getParameters(), language);
                        cacheService.put(paramCacheKey, responseBody);
                        logger.info("✓ Cached with PARAMETERS: {} -> Cache key: {}",
                            aiResponse.getParameters().toCacheKey(), paramCacheKey);

                        // Also cache with prompt-based key for backward compatibility
                        cacheService.put(cacheKey, responseBody);
                    } else {
                        // Old format or no parameters - use prompt-based caching
                        cacheService.put(cacheKey, responseBody);
                        logger.info("✓ Cached with PROMPT (no parameters): length={}", prompt.length());
                    }
                } catch (Exception e) {
                    // Failed to parse as new format - treat as raw response (backward compatibility)
                    cacheService.put(cacheKey, responseBody);
                    logger.debug("Response doesn't have parameter structure, using prompt-based caching", e);
                }
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

            // Enhanced error logging based on status code
            if (e.getStatusCode().value() == 404) {
                // Extract path for debugging (without exposing domain)
                String pathOnly = "/";
                try {
                    String afterProtocol = n8nWebhookUrl.substring(n8nWebhookUrl.indexOf("://") + 3);
                    pathOnly = afterProtocol.contains("/") ? afterProtocol.substring(afterProtocol.indexOf("/")) : "/";
                } catch (Exception ex) {
                    logger.debug("Could not extract path from URL", ex);
                }

                logger.error("========================================");
                logger.error("N8N WEBHOOK NOT FOUND (404)");
                logger.error("Attempted URL: {}", n8nWebhookUrl.replaceAll("(https?://[^/]+).*", "$1/***"));
                logger.error("Path: {}", pathOnly);
                logger.error("Request method: POST");
                logger.error("Request payload: message={}, language={}", prompt.substring(0, Math.min(50, prompt.length())), language);
                logger.error("========================================");
                logger.error("Response from N8N:");
                logger.error("{}", e.getResponseBodyAsString());
                logger.error("========================================");
                logger.error("Troubleshooting:");
                logger.error("1. Verify curl works: curl -X POST <your-webhook-url> -H 'Content-Type: application/json' -d '{{\"message\":\"test\",\"language\":\"en\"}}'");
                logger.error("2. Check if N8N_WEBHOOK_URL env var exactly matches your working curl command");
                logger.error("3. In N8N, check if webhook is in Production mode (not Test mode)");
                logger.error("4. Compare the 'Path' logged above with your N8N webhook node configuration");
                logger.error("========================================");
            } else {
                logger.error(errorMsg, e);
            }

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
