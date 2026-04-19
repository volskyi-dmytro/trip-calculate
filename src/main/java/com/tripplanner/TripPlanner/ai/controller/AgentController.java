package com.tripplanner.TripPlanner.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.ai.access.AiAccessFilter;
import com.tripplanner.TripPlanner.ai.access.AiAccessService;
import com.tripplanner.TripPlanner.ai.access.GrantCacheEntry;
import com.tripplanner.TripPlanner.ai.client.AgentServiceClient;
import com.tripplanner.TripPlanner.ai.security.InvalidInputException;
import com.tripplanner.TripPlanner.ai.security.PromptInjectionFilter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * SSE relay controller: bridges the React frontend ↔ langgraph-agent service.
 *
 * Contract per docs/agent-sse-contract.md §"AgentController responsibilities (M3 preview)":
 *
 * 1. Reads aiUserId from the request attribute set by AiAccessFilter (never re-resolves
 *    the principal — the filter is the single authoritative source for this value).
 * 2. Accepts JSON body {@link AgentChatRequest}; derives a stable per-user thread id
 *    when sessionId is absent.
 * 3. Sanitises the message field via PromptInjectionFilter.sanitize() — this is the
 *    correct place for JSON-body prompt-injection screening. AiAccessFilter cannot consume
 *    the request body without breaking the controller's ability to read it; the filter
 *    already handles form-encoded bodies. See AiAccessFilter lines 112-123.
 * 4. Delegates streaming to AgentServiceClient.stream().
 * 5. Returns Flux<ServerSentEvent<String>> with SSE headers.
 * 6. On stream completion, fire-and-forget recordUsage() — values come from the done
 *    event payload (M5 will populate them; until then they are 0).
 * 7. Converts TimeoutException / IOException / WebClientResponseException to a synthetic
 *    SSE error frame with a generic user-safe message (no internal exception detail
 *    per CLAUDE.md §Non-negotiable rule 9 spirit).
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@Slf4j
public class AgentController {

    // Defense-in-depth: mirrors the timeout in AgentServiceClient. If the client's
    // Flux timeout fires first this one never triggers — if somehow the client timeout
    // is misconfigured this backstop still protects the server thread.
    private static final Duration CONTROLLER_TIMEOUT = Duration.ofMinutes(5);

    // 15s matches the agent's own comment-frame interval. Comment frames are stripped by
    // Spring's SSE codec, so we re-emit them here so Cloudflare (100s idle) and nginx
    // (proxy_read_timeout) do not close the connection during long agent runs.
    private static final Duration KEEPALIVE_INTERVAL = Duration.ofSeconds(15);

    private final AgentServiceClient agentServiceClient;
    private final AiAccessService aiAccessService;
    private final ObjectMapper objectMapper;

    /**
     * POST /api/ai/chat — SSE relay to the langgraph-agent service.
     *
     * Produces: text/event-stream
     * CSRF: exempt (SecurityConfig ignores /api/ai/**)
     * Auth: enforced by AiAccessFilter upstream
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<String>>> chat(
            @RequestBody AgentChatRequest chatRequest,
            HttpServletRequest httpRequest) {

        // Step 1 — read userId set by AiAccessFilter; defensive 401 if somehow null.
        String userId = (String) httpRequest.getAttribute(AiAccessFilter.AI_USER_ID_ATTRIBUTE);
        if (userId == null) {
            // This path should never be reached in production because AiAccessFilter
            // blocks unauthenticated requests before they reach this controller.
            // The guard is here purely as a fail-safe.
            log.warn("AgentController reached without aiUserId attribute — AiAccessFilter may not be in chain");
            return ResponseEntity.status(401).build();
        }

        // Step 2 — validate message field is present
        String rawMessage = chatRequest.getMessage();
        if (rawMessage == null || rawMessage.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Flux.just(ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"error\":\"invalid_input\",\"message\":\"Message must not be blank.\"}")
                            .build()));
        }

        // Step 3 — sanitise via PromptInjectionFilter.
        // WHY here and not in AiAccessFilter: the filter cannot read the JSON request body
        // without consuming the InputStream, which would prevent the controller from
        // deserialising @RequestBody. The filter already handles form-encoded bodies;
        // JSON-body sanitisation is the controller's responsibility per the M3 design.
        String sanitisedMessage;
        try {
            sanitisedMessage = PromptInjectionFilter.sanitize(rawMessage);
        } catch (InvalidInputException e) {
            // getDetail() carries the matching pattern — operator-only, TRACE level.
            // getMessage() is the public-safe summary; never echoed to the response either.
            log.trace("Prompt injection blocked: {}", e.getDetail());
            log.debug("Prompt injection blocked for chat request");
            return ResponseEntity.badRequest()
                    .body(Flux.just(ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"error\":\"invalid_input\",\"message\":\"Input contains disallowed content.\"}")
                            .build()));
        }

        // Step 2b — resolve thread id.
        // WHY stable default: using a random UUID per call would create a new LangGraph
        // checkpoint on every request, defeating multi-turn conversation state.
        // userId + ":default" is deterministic per user and safe as a checkpoint key.
        String sessionId = (chatRequest.getSessionId() != null && !chatRequest.getSessionId().isBlank())
                ? chatRequest.getSessionId()
                : userId + ":default";

        // Accumulate usage delta from the done event; initialised to 0 so recordUsage
        // is always called even when the Python service does not yet emit cost fields (M5).
        AtomicInteger tokenAccumulator  = new AtomicInteger(0);
        AtomicReference<Double> costAccumulator = new AtomicReference<>(0.0);

        // M5: read this user's USD caps from the cached grant so they can be embedded
        // in the internal JWT and consumed by BudgetGuardMiddleware on the agent side
        // without round-tripping to Supabase.
        Optional<GrantCacheEntry> grant = aiAccessService.getCachedGrant(userId);
        BigDecimal dailyCapUsd   = grant.map(GrantCacheEntry::dailyUsdCap).orElse(null);
        BigDecimal monthlyCapUsd = grant.map(GrantCacheEntry::monthlyUsdCap).orElse(null);

        // Step 4 — build the streaming Flux
        Flux<ServerSentEvent<String>> sseFlux = agentServiceClient
                .stream(userId, sanitisedMessage, sessionId, dailyCapUsd, monthlyCapUsd)

                // Parse the done event to extract tokens + cost_usd for usage recording.
                // Missing fields are treated as 0 and logged at DEBUG so the gap is visible
                // when M5 starts emitting them. Parse failures never interrupt the stream.
                .doOnNext(event -> {
                    if ("done".equals(event.event()) && event.data() != null) {
                        try {
                            JsonNode node = objectMapper.readTree(event.data());
                            JsonNode tokensNode = node.get("tokens");
                            JsonNode costNode   = node.get("cost_usd");
                            if (tokensNode == null || costNode == null) {
                                log.debug("done event missing tokens/cost_usd — treating as 0 " +
                                        "(M5 will populate these fields)");
                            } else {
                                tokenAccumulator.set(tokensNode.asInt(0));
                                costAccumulator.set(costNode.asDouble(0.0));
                            }
                        } catch (Exception e) {
                            // Malformed JSON in done payload — log and continue streaming;
                            // do not block the stream on a parse failure.
                            log.debug("Failed to parse done event payload: {}", e.getMessage());
                        }
                    }
                })

                // Step 6 — flush usage to Redis + Supabase on natural completion.
                // fire-and-forget: recordUsage() swallows its own errors internally.
                .doOnComplete(() ->
                        aiAccessService.recordUsage(userId, tokenAccumulator.get(), costAccumulator.get()))

                // Controller-level timeout MUST be applied BEFORE the onErrorResume handlers,
                // otherwise a TimeoutException emitted by .timeout() would propagate past the
                // handlers below and reach the subscriber unhandled.
                .timeout(CONTROLLER_TIMEOUT)

                // Step 7 — translate known transient errors to synthetic SSE error frames.
                // Only specific exception types are handled here; unexpected exceptions are
                // left to propagate so operators can see them in server logs.
                // Generic public messages only — exception detail (URLs, host:port, stack)
                // never reaches the response per CLAUDE.md §Non-negotiable rule 9 spirit.
                .onErrorResume(TimeoutException.class, ex -> {
                    log.warn("Agent session timed out (session: {})", sessionId);
                    return Flux.just(ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"message\":\"Agent session timed out. Please try again.\"}")
                            .build());
                })
                .onErrorResume(IOException.class, ex -> {
                    // Do NOT log ex.getMessage() — IOException messages routinely contain
                    // internal host:port (e.g. "Connection refused: langgraph-agent:8000")
                    // which leaks topology to log aggregators. Class name is enough for triage.
                    log.warn("Agent service I/O error (session: {}, type: {})",
                            sessionId, ex.getClass().getSimpleName());
                    return Flux.just(ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"message\":\"Agent service unavailable. Please try again.\"}")
                            .build());
                })
                .onErrorResume(WebClientResponseException.class, ex -> {
                    log.warn("Agent service returned HTTP {} (session: {})", ex.getStatusCode().value(), sessionId);
                    return Flux.just(ServerSentEvent.<String>builder()
                            .event("error")
                            .data("{\"message\":\"Agent service unavailable. Please try again.\"}")
                            .build());
                });

        // Spring-side keep-alive: Spring's ServerSentEventHttpMessageReader strips comment
        // frames (": ping") during parse, so the Python service's 15s comment-frame keep-alives
        // do not reach the browser. Merge a relay-side comment heartbeat so idle connections
        // stay open through Cloudflare's 100s and nginx's proxy_read_timeout. takeUntilOther
        // ensures the heartbeat stops as soon as the agent stream completes (or errors).
        Flux<ServerSentEvent<String>> heartbeat = Flux.interval(KEEPALIVE_INTERVAL)
                .map(tick -> ServerSentEvent.<String>builder().comment("ping").build());

        Flux<ServerSentEvent<String>> merged = Flux.merge(
                sseFlux,
                heartbeat.takeUntilOther(sseFlux.ignoreElements()));

        // Step 5 — return with required SSE response headers.
        // Cache-Control: no-cache + X-Accel-Buffering: no are mandatory for Cloudflare +
        // nginx not to buffer the stream (see CLAUDE.md §Common Troubleshooting and
        // docs/agent-sse-contract.md §Transport).
        HttpHeaders headers = new HttpHeaders();
        headers.set("Cache-Control", "no-cache");
        headers.set("X-Accel-Buffering", "no");
        headers.set("Connection", "keep-alive");
        headers.set("Pragma", "no-cache");

        return ResponseEntity.ok()
                .headers(headers)
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(merged);
    }
}
