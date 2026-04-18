package com.tripplanner.TripPlanner.ai.client;

import com.tripplanner.TripPlanner.ai.security.InternalTokenIssuer;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.reactive.function.client.ClientRequest;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for AgentServiceClient using a custom ExchangeFunction to capture
 * outbound requests without requiring MockWebServer or WireMock on the classpath.
 *
 * Coverage:
 *  1. X-Internal-Token header is present and is a valid HS256 JWT on every request.
 *  2. SSE body is parsed as Flux<ServerSentEvent<String>> (not buffered).
 *  3. 5xx from the agent service propagates as an error signal (not silently swallowed).
 */
class AgentServiceClientTest {

    // Same secret used in InternalTokenIssuer — must be ≥ 32 chars for HS256
    private static final String JWT_SECRET = "test-secret-key-for-unit-tests-min-32-chars!!";
    private static final String USER_ID    = "test-user-sub-123";
    private static final String SESSION_ID = "session-abc";
    private static final String PROMPT     = "Plan a trip from Kyiv to Lviv";

    private InternalTokenIssuer tokenIssuer;
    private SecretKey           signingKey;

    @BeforeEach
    void setUp() {
        tokenIssuer = new InternalTokenIssuer(JWT_SECRET);
        signingKey  = Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8));
    }

    // -------------------------------------------------------------------------
    // 1. JWT header attached on every request
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("X-Internal-Token header is present and contains a valid HS256 JWT with correct sub")
    void jwtHeaderAttachedOnEveryRequest() {
        AtomicReference<ClientRequest> capturedRequest = new AtomicReference<>();

        ExchangeFunction exchange = request -> {
            capturedRequest.set(request);
            // Return an empty SSE stream so the Flux completes cleanly
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE)
                    .body("event: done\ndata: {\"status\":\"ok\"}\n\n")
                    .build());
        };

        WebClient webClient = WebClient.builder()
                .exchangeFunction(exchange)
                .build();

        AgentServiceClient client = new AgentServiceClient(webClient, tokenIssuer);
        // Subscribe and drain the stream to trigger the exchange
        client.stream(USER_ID, PROMPT, SESSION_ID)
                .blockLast(AgentServiceClient.STREAM_TIMEOUT);

        ClientRequest req = capturedRequest.get();
        assertThat(req).isNotNull();

        String tokenHeader = req.headers().getFirst(AgentServiceClient.INTERNAL_TOKEN_HEADER);
        assertThat(tokenHeader).isNotNull().isNotBlank();

        // Verify it is a valid HS256 JWT signed with the correct secret and sub = userId
        JwtParser parser = Jwts.parser()
                .verifyWith(signingKey)
                .build();
        Claims claims = parser.parseSignedClaims(tokenHeader).getPayload();
        assertThat(claims.getSubject()).isEqualTo(USER_ID);
        assertThat(claims.getExpiration()).isNotNull();
    }

    // -------------------------------------------------------------------------
    // 2. SSE body parsed as Flux (not buffered)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("SSE body is returned as Flux<ServerSentEvent<String>> with expected events")
    void sseParsedAsFlux() {
        String sseBody =
                "event: updates\ndata: {\"step\":1}\n\n" +
                "event: messages\ndata: {\"content\":\"Planning...\"}\n\n" +
                "event: done\ndata: {\"status\":\"ok\"}\n\n";

        ExchangeFunction exchange = request -> Mono.just(
                ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE)
                        .body(sseBody)
                        .build());

        WebClient webClient = WebClient.builder().exchangeFunction(exchange).build();
        AgentServiceClient client = new AgentServiceClient(webClient, tokenIssuer);

        List<ServerSentEvent<String>> events = new ArrayList<>();
        client.stream(USER_ID, PROMPT, SESSION_ID)
                .doOnNext(events::add)
                .blockLast(AgentServiceClient.STREAM_TIMEOUT);

        assertThat(events).isNotEmpty();
        // Verify event names are preserved (SSE codec should populate event() field)
        boolean hasUpdates = events.stream().anyMatch(e -> "updates".equals(e.event()));
        boolean hasDone    = events.stream().anyMatch(e -> "done".equals(e.event()));
        assertThat(hasUpdates).isTrue();
        assertThat(hasDone).isTrue();
    }

    // -------------------------------------------------------------------------
    // 3. 5xx propagates as error signal
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("5xx response from agent service propagates as error in the Flux")
    void agentService5xx_propagatesAsError() {
        ExchangeFunction exchange = request -> Mono.just(
                ClientResponse.create(HttpStatus.INTERNAL_SERVER_ERROR)
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                        .body("{\"detail\":\"agent crashed\"}")
                        .build());

        WebClient webClient = WebClient.builder().exchangeFunction(exchange).build();
        AgentServiceClient client = new AgentServiceClient(webClient, tokenIssuer);

        StepVerifier.create(client.stream(USER_ID, PROMPT, SESSION_ID))
                .expectError()
                .verify(AgentServiceClient.STREAM_TIMEOUT);
    }

    // -------------------------------------------------------------------------
    // Bonus: Accept and Cache-Control headers are set correctly
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Request carries Accept: text/event-stream and Cache-Control: no-cache")
    void correctSseHeaders() {
        AtomicReference<ClientRequest> capturedRequest = new AtomicReference<>();

        ExchangeFunction exchange = request -> {
            capturedRequest.set(request);
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE)
                    .body("event: done\ndata: {\"status\":\"ok\"}\n\n")
                    .build());
        };

        WebClient webClient = WebClient.builder().exchangeFunction(exchange).build();
        AgentServiceClient client = new AgentServiceClient(webClient, tokenIssuer);

        client.stream(USER_ID, PROMPT, SESSION_ID)
                .blockLast(AgentServiceClient.STREAM_TIMEOUT);

        ClientRequest req = capturedRequest.get();
        assertThat(req.headers().getFirst(HttpHeaders.ACCEPT))
                .isEqualTo(MediaType.TEXT_EVENT_STREAM_VALUE);
        assertThat(req.headers().getFirst(HttpHeaders.CACHE_CONTROL))
                .isEqualTo("no-cache");
    }
}
