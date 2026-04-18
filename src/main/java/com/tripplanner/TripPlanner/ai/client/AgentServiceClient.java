package com.tripplanner.TripPlanner.ai.client;

import com.tripplanner.TripPlanner.ai.security.InternalTokenIssuer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import org.springframework.http.codec.ServerSentEvent;

import java.time.Duration;

/**
 * Reactive client for the internal langgraph-agent service (M2).
 *
 * Responsibilities:
 *  - Issues a short-lived HS256 JWT per request via {@link InternalTokenIssuer}.
 *  - POSTs to POST /api/agent/stream with the user message and session metadata.
 *  - Returns a {@code Flux<ServerSentEvent<String>>} driven by the agent's SSE response.
 *  - Enforces a 5-minute flux timeout (agent sessions can be long; see CLAUDE.md rule 8).
 *
 * Non-responsibilities (caller's concern):
 *  - Retries — the Python agent service handles its own tool retries.
 *  - Usage tracking — AgentController wires doOnComplete to flush counters (M3).
 *  - 401/403 from the agent service propagate as error signals without transformation.
 *
 * The WebClient bean ("agentWebClient") is configured in {@link AgentWebClientConfig}
 * with an infinite response timeout so Reactor Netty does not truncate the SSE stream.
 *
 * Note on SSE buffering (from CLAUDE.md §Common Troubleshooting):
 *  bodyToFlux(ParameterizedTypeReference) is the correct API for streaming SSE.
 *  bodyToMono(String.class) would buffer the entire response body in memory —
 *  never use it for SSE endpoints.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AgentServiceClient {

    static final String  INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    static final Duration STREAM_TIMEOUT        = Duration.ofMinutes(5);

    // Qualifier "agentWebClient" set in AgentWebClientConfig
    private final WebClient agentWebClient;
    private final InternalTokenIssuer tokenIssuer;

    /**
     * Opens an SSE stream from the langgraph-agent service.
     *
     * A fresh HS256 JWT (30s expiry) is issued per call so tokens are never reused.
     *
     * @param userId    the authenticated user's Google sub claim
     * @param prompt    the sanitised user message (already through PromptInjectionFilter)
     * @param sessionId LangGraph thread ID; caller must supply a stable non-null value
     * @return cold {@code Flux} that begins streaming when subscribed; completes on SSE
     *         {@code done} or {@code error} event, or after 5-minute hard timeout
     */
    public Flux<ServerSentEvent<String>> stream(String userId, String prompt, String sessionId) {
        String token = tokenIssuer.issue(userId);

        // User identity travels in the JWT sub claim — not duplicated in the body.
        AgentStreamRequest body = AgentStreamRequest.builder()
                .message(prompt)
                .threadId(sessionId)
                .build();

        return agentWebClient.post()
                .uri("/api/agent/stream")
                .header(INTERNAL_TOKEN_HEADER, token)
                .header("Accept", MediaType.TEXT_EVENT_STREAM_VALUE)
                .header("Cache-Control", "no-cache")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                // bodyToFlux with ParameterizedTypeReference is the correct API for SSE streaming.
                // Do NOT replace with bodyToMono(String.class) — that buffers the whole response.
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                .timeout(STREAM_TIMEOUT)
                .doOnError(WebClientResponseException.class, ex ->
                        log.warn("Agent service responded with HTTP {}: {}",
                                ex.getStatusCode().value(), ex.getMessage()))
                .doOnError(ex -> !(ex instanceof WebClientResponseException), ex ->
                        log.warn("Agent stream error: {}", ex.getMessage()));
    }
}
