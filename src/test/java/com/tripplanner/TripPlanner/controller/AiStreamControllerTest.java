package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiStreamControllerTest {

    private AiCacheService cacheService;
    private AiUsageService usageService;
    private HttpServletRequest httpRequest;
    private AiStreamController controller;

    @BeforeEach
    void setUp() {
        cacheService = mock(AiCacheService.class);
        usageService = mock(AiUsageService.class);
        httpRequest = mock(HttpServletRequest.class);
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
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(request("  "), httpRequest));
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(request("x".repeat(501)), httpRequest));
        Map<String, Object> big = request("Kyiv to Lviv");
        big.put("currentRoute", java.util.Collections.nCopies(26, Map.of()));
        assertInstanceOf(ResponseEntity.class, controller.streamInsights(big, httpRequest));
        verifyNoInteractions(cacheService);
    }

    @Test
    void rejectsWhenAgentNotConfigured() {
        ReflectionTestUtils.setField(controller, "agentUrl", "");
        Object result = controller.streamInsights(request("Kyiv to Lviv"), httpRequest);
        assertInstanceOf(ResponseEntity.class, result);
        assertEquals(503, ((ResponseEntity<?>) result).getStatusCode().value());
    }

    @Test
    void cacheHitEmitsResultWithoutContactingAgent() {
        when(cacheService.get("key")).thenReturn("{\"success\":true}");
        Object result = controller.streamInsights(request("Kyiv to Lviv"), httpRequest);
        assertInstanceOf(SseEmitter.class, result);
        // Cached body served → outcome logged as cached; upstream never dialed
        verify(usageService).logResponse(eq(1L), eq("success_cached"), isNull(), anyLong());
    }

    @Test
    void modificationRequestsBypassCache() {
        Map<String, Object> m = request("add a stop in Ternopil");
        m.put("currentRoute", List.of(Map.of("name", "Kyiv", "latitude", 50.45, "longitude", 30.52)));
        Object result = controller.streamInsights(m, httpRequest);
        assertInstanceOf(SseEmitter.class, result);
        verify(cacheService, never()).get(anyString());
    }
}
