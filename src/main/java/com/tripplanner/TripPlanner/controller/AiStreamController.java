package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.dto.AgentResponse;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

/**
 * SSE relay in front of the agent's /parse-route/stream. Applies the exact
 * guards and cache gate of the sync proxy (AiInsightsController); on a cache
 * hit it emits a single result frame so the stream contract holds even for
 * instant answers. JDK HttpClient (not WebFlux) — the project is Spring MVC.
 */
@RestController
@RequestMapping("/api/ai")
public class AiStreamController {

    private static final Logger logger = LoggerFactory.getLogger(AiStreamController.class);
    private static final int MAX_MESSAGE_LENGTH = 500;
    private static final int MAX_CURRENT_ROUTE_WAYPOINTS = 25;
    // Agent worst case ≈ geocode retries ~30s; generous headroom, still bounded
    private static final long EMITTER_TIMEOUT_MS = 75_000L;
    private static final Duration UPSTREAM_TIMEOUT = Duration.ofSeconds(70);

    @Value("${agent.url:}")
    private String agentUrl;

    private final AiCacheService cacheService;
    private final AiUsageService usageService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ExecutorService relayExecutor = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "ai-sse-relay");
        t.setDaemon(true);
        return t;
    });

    public AiStreamController(AiCacheService cacheService, AiUsageService usageService,
                              ObjectMapper objectMapper) {
        this.cacheService = cacheService;
        this.usageService = usageService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/insights/stream")
    public Object streamInsights(@RequestBody Map<String, Object> request,
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
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);

        // Cache gate identical to the sync proxy: modification requests
        // depend on the caller's current route and must not be replayed
        boolean cacheable = currentRoute.isEmpty();
        String cacheKey = cacheService.cacheKey(prompt, language);
        String cached = cacheable ? cacheService.get(cacheKey) : null;
        if (cached != null) {
            Long logId = usageService.logRequest(null, userEmail, clientIp, prompt, language);
            usageService.logResponse(logId, "success_cached", null, System.currentTimeMillis() - startTime);
            relayExecutor.submit(() -> {
                try {
                    emitter.send(SseEmitter.event().name("result").data(cached, MediaType.APPLICATION_JSON));
                    emitter.complete();
                } catch (Exception e) {
                    emitter.completeWithError(e);
                }
            });
            return emitter;
        }

        Long logId = usageService.logRequest(null, userEmail, clientIp, prompt, language);

        Map<String, Object> body = new HashMap<>();
        body.put("message", prompt);
        body.put("language", language);
        body.put("user_id", userEmail != null ? userEmail : "anonymous");
        if (!currentRoute.isEmpty()) {
            body.put("current_route", currentRoute);
        }
        if (request.get("settingsContext") instanceof Map<?, ?> settingsContext) {
            body.put("settings_context", settingsContext);
        }

        final HttpRequest upstream;
        try {
            upstream = HttpRequest.newBuilder(URI.create(agentUrl + "/parse-route/stream"))
                    .timeout(UPSTREAM_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "TripPlanner-Backend/1.0")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
        } catch (Exception e) {
            usageService.logResponse(logId, "error", e.getMessage(), System.currentTimeMillis() - startTime);
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to contact agent"));
        }

        CompletableFuture<HttpResponse<Stream<String>>> future =
                httpClient.sendAsync(upstream, HttpResponse.BodyHandlers.ofLines());

        // Any terminal emitter state cancels the upstream request so the
        // agent doesn't keep computing for a client that's gone
        emitter.onCompletion(() -> future.cancel(true));
        emitter.onTimeout(() -> future.cancel(true));
        emitter.onError(e -> future.cancel(true));

        relayExecutor.submit(() -> relay(future, emitter, cacheable, cacheKey, logId, startTime));
        return emitter;
    }

    private void relay(CompletableFuture<HttpResponse<Stream<String>>> future, SseEmitter emitter,
                       boolean cacheable, String cacheKey, Long logId, long startTime) {
        try {
            HttpResponse<Stream<String>> response = future.get();
            if (response.statusCode() != 200) {
                usageService.logResponse(logId, "error", "Agent returned " + response.statusCode(),
                        System.currentTimeMillis() - startTime);
                emitter.send(SseEmitter.event().name("error")
                        .data("{\"error\":\"stream_failed\"}", MediaType.APPLICATION_JSON));
                emitter.complete();
                return;
            }
            String event = null;
            StringBuilder data = new StringBuilder();
            for (String line : (Iterable<String>) () -> response.body().iterator()) {
                if (line.startsWith("event: ")) {
                    event = line.substring("event: ".length()).trim();
                } else if (line.startsWith("data: ")) {
                    data.append(line.substring("data: ".length()));
                } else if (line.isEmpty() && event != null) {
                    String payload = data.toString();
                    emitter.send(SseEmitter.event().name(event).data(payload, MediaType.APPLICATION_JSON));
                    if ("result".equals(event)) {
                        recordResult(payload, cacheable, cacheKey, logId, startTime);
                    } else if ("error".equals(event)) {
                        usageService.logResponse(logId, "error", "stream_failed",
                                System.currentTimeMillis() - startTime);
                    }
                    event = null;
                    data.setLength(0);
                }
            }
            emitter.complete();
        } catch (Exception e) {
            logger.warn("AI stream relay failed: {}", e.getMessage());
            usageService.logResponse(logId, "error", e.getMessage(), System.currentTimeMillis() - startTime);
            try {
                emitter.send(SseEmitter.event().name("error")
                        .data("{\"error\":\"stream_failed\"}", MediaType.APPLICATION_JSON));
                emitter.complete();
            } catch (Exception ignored) {
                emitter.completeWithError(e);
            }
        }
    }

    /** Same cache/log semantics as the sync proxy's post-response handling. */
    private void recordResult(String payload, boolean cacheable, String cacheKey,
                              Long logId, long startTime) {
        long duration = System.currentTimeMillis() - startTime;
        try {
            AgentResponse agentResponse = objectMapper.readValue(payload, AgentResponse.class);
            if (agentResponse != null && agentResponse.isValid()) {
                if (cacheable) {
                    cacheService.put(cacheKey, payload);
                }
                usageService.logResponse(logId, "success", null, duration);
            } else {
                String agentError = agentResponse != null ? agentResponse.getError() : "unparseable response";
                usageService.logResponse(logId, "agent_error", agentError, duration);
            }
        } catch (Exception e) {
            usageService.logResponse(logId, "agent_error", "unparseable response", duration);
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

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        return (xff != null && !xff.isEmpty()) ? xff.split(",")[0].trim() : request.getRemoteAddr();
    }
}
