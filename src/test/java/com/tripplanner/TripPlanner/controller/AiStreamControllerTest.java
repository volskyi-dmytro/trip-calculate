package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiStreamControllerTest {

    private AiCacheService cacheService;
    private AiUsageService usageService;
    private HttpServletRequest httpRequest;
    private HttpServletResponse httpResponse;
    private AiStreamController controller;

    @BeforeEach
    void setUp() {
        cacheService = mock(AiCacheService.class);
        usageService = mock(AiUsageService.class);
        httpRequest = mock(HttpServletRequest.class);
        httpResponse = mock(HttpServletResponse.class);
        controller = new AiStreamController(cacheService, usageService, new ObjectMapper());
        ReflectionTestUtils.setField(controller, "agentUrl", "http://localhost:1");
        when(usageService.logRequest(any(), any(), any(), any(), any())).thenReturn(1L);
        when(cacheService.cacheKey(anyString(), anyString())).thenReturn("key");
    }

    private Map<String, Object> request(String message) {
        Map<String, Object> m = new HashMap<>();
        m.put("message", message);
        m.put("language", "en");
        return m;
    }

    @Test
    void rejectsEmptyAndOversizedWithoutOpeningStream() {
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(request("  "), httpRequest, httpResponse));
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(request("x".repeat(501)), httpRequest, httpResponse));
        Map<String, Object> big = request("Kyiv to Lviv");
        big.put("currentRoute", java.util.Collections.nCopies(26, Map.of()));
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(big, httpRequest, httpResponse));
        verifyNoInteractions(cacheService);
    }

    @Test
    void rejectsWhenAgentNotConfigured() {
        ReflectionTestUtils.setField(controller, "agentUrl", "");
        Object result = controller.streamInsights(request("Kyiv to Lviv"), httpRequest, httpResponse);
        assertInstanceOf(ResponseEntity.class, result);
        assertEquals(503, ((ResponseEntity<?>) result).getStatusCode().value());
    }

    @Test
    void cacheHitEmitsResultWithoutContactingAgent() {
        when(cacheService.get("key")).thenReturn("{\"success\":true}");
        Object result = controller.streamInsights(request("Kyiv to Lviv"), httpRequest, httpResponse);
        assertInstanceOf(SseEmitter.class, result);
        // Cached body served → outcome logged as cached; upstream never dialed
        verify(usageService).logResponse(eq(1L), eq("success_cached"), isNull(), anyLong());
    }

    @Test
    void modificationRequestsBypassCache() {
        Map<String, Object> m = request("add a stop in Ternopil");
        m.put("currentRoute", List.of(Map.of("name", "Kyiv", "latitude", 50.45, "longitude", 30.52)));
        Object result = controller.streamInsights(m, httpRequest, httpResponse);
        assertInstanceOf(SseEmitter.class, result);
        verify(cacheService, never()).get(anyString());
    }

    // ---- forwardSseLines: SSE line-parsing loop, extracted for unit coverage ----

    /** Records every frame handed to the sink, in order, as {event, data} pairs. */
    private static class RecordingSink implements AiStreamController.SseFrameSink {
        final List<String[]> frames = new ArrayList<>();

        @Override
        public void frame(String event, String data) {
            frames.add(new String[]{event, data});
        }
    }

    private static void forward(RecordingSink sink, String... lines) throws Exception {
        Iterator<String> it = List.of(lines).iterator();
        AiStreamController.forwardSseLines(it, sink);
    }

    @Test
    void forwardSseLines_singleFrame() throws Exception {
        RecordingSink sink = new RecordingSink();
        forward(sink, "event: result", "data: {\"a\":1}", "");
        assertEquals(1, sink.frames.size());
        assertArrayEquals(new String[]{"result", "{\"a\":1}"}, sink.frames.get(0));
    }

    @Test
    void forwardSseLines_multipleDataLinesJoinWithNewline() throws Exception {
        RecordingSink sink = new RecordingSink();
        forward(sink, "event: result", "data: line1", "data: line2", "data: line3", "");
        assertEquals(1, sink.frames.size());
        assertArrayEquals(new String[]{"result", "line1\nline2\nline3"}, sink.frames.get(0));
    }

    @Test
    void forwardSseLines_multipleFramesInSequence() throws Exception {
        RecordingSink sink = new RecordingSink();
        forward(sink,
                "event: progress", "data: 1", "",
                "event: result", "data: 2", "");
        assertEquals(2, sink.frames.size());
        assertArrayEquals(new String[]{"progress", "1"}, sink.frames.get(0));
        assertArrayEquals(new String[]{"result", "2"}, sink.frames.get(1));
    }

    @Test
    void forwardSseLines_linesBeforeAnyEventAreIgnored() throws Exception {
        RecordingSink sink = new RecordingSink();
        // Non-SSE-prefixed content (e.g. a keep-alive comment) and a stray blank
        // line before the first "event:" must not produce a frame, and must not
        // leak into the data of the frame that follows.
        forward(sink, ": keep-alive", "", "event: result", "data: ok", "");
        assertEquals(1, sink.frames.size());
        assertArrayEquals(new String[]{"result", "ok"}, sink.frames.get(0));
    }

    @Test
    void forwardSseLines_trailingFrameWithoutBlankTerminatorNotEmitted() throws Exception {
        RecordingSink sink = new RecordingSink();
        // No terminating blank line after the last data: — by design this is dropped,
        // not flushed, since a truncated stream shouldn't be treated as a complete frame.
        forward(sink, "event: result", "data: partial");
        assertTrue(sink.frames.isEmpty());
    }

    @Test
    void forwardSseLines_spacelessFieldsParseIdenticallyToSpaced() throws Exception {
        RecordingSink sink = new RecordingSink();
        // Spring's SseEmitter re-serializes "event: x" as "event:x" (no space);
        // the parser must accept both forms identically.
        forward(sink, "event:stage", "data:{\"a\":1}", "");
        assertEquals(1, sink.frames.size());
        assertArrayEquals(new String[]{"stage", "{\"a\":1}"}, sink.frames.get(0));
    }

    @Test
    void forwardSseLines_dataWithTwoLeadingSpacesPreservesOne() throws Exception {
        RecordingSink sink = new RecordingSink();
        // Per SSE spec only ONE leading space after the colon is stripped as
        // field syntax; any further leading whitespace is part of the value.
        forward(sink, "event: result", "data:  padded", "");
        assertEquals(1, sink.frames.size());
        assertArrayEquals(new String[]{"result", " padded"}, sink.frames.get(0));
    }

    // ---- relay(): exception path when the upstream body stream fails mid-iteration ----

    @Test
    @SuppressWarnings("unchecked")
    void relay_bodyStreamFailureEmitsSanitizedErrorAndLogsError() throws Exception {
        HttpResponse<Stream<String>> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        // Simulates a connection drop mid-body: any pull from the stream throws.
        when(response.body()).thenReturn(Stream.generate(() -> {
            throw new RuntimeException("boom");
        }));
        CompletableFuture<HttpResponse<Stream<String>>> future = CompletableFuture.completedFuture(response);
        SseEmitter emitter = mock(SseEmitter.class);

        controller.relay(future, emitter, false, "key", 1L, System.currentTimeMillis(), new AtomicReference<>());

        ArgumentCaptor<SseEmitter.SseEventBuilder> captor = ArgumentCaptor.forClass(SseEmitter.SseEventBuilder.class);
        verify(emitter).send(captor.capture());
        // SseEventBuilder.build() packs framing text (e.g. "event:error\ndata:") as
        // separate TEXT_PLAIN entries alongside the actual payload entry, so assert
        // on membership/absence rather than the raw Set's size or iteration order.
        Set<ResponseBodyEmitter.DataWithMediaType> built = captor.getValue().build();
        boolean sawSanitizedPayload = built.stream()
                .anyMatch(d -> "{\"error\":\"stream_failed\"}".equals(d.getData()));
        assertTrue(sawSanitizedPayload, "expected sanitized error payload among sent data: " + built);
        boolean leakedExceptionText = built.stream()
                .map(d -> String.valueOf(d.getData()))
                .anyMatch(s -> s.contains("boom") || s.contains("RuntimeException"));
        assertFalse(leakedExceptionText, "exception text must not reach the emitter: " + built);
        verify(emitter).complete();
        verify(emitter, never()).completeWithError(any());
        verify(usageService).logResponse(eq(1L), eq("error"), eq("boom"), anyLong());
    }

    @Test
    @SuppressWarnings("unchecked")
    void relay_streamEndsWithoutTerminalFrameLogsError() throws Exception {
        HttpResponse<Stream<String>> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        // Upstream body ends cleanly (mid-iteration close, not an exception) after
        // only a stage frame — no "result" or "error" frame is ever produced.
        when(response.body()).thenReturn(Stream.of("event: stage", "data: {\"stage\":\"route\"}", ""));
        CompletableFuture<HttpResponse<Stream<String>>> future = CompletableFuture.completedFuture(response);
        SseEmitter emitter = mock(SseEmitter.class);

        controller.relay(future, emitter, false, "key", 1L, System.currentTimeMillis(), new AtomicReference<>());

        verify(emitter).complete();
        verify(usageService).logResponse(eq(1L), eq("error"), eq("stream ended without terminal frame"), anyLong());
    }
}
