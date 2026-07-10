package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Guards the AI proxy's input validation: over-long prompts must be
 * rejected before any usage logging, cache lookup, or agent call —
 * the length cap is the backend's cost-control line of defense.
 */
class AiInsightsControllerTest {

    private final AiCacheService cacheService = mock(AiCacheService.class);

    private AiInsightsController controller() {
        return new AiInsightsController(
                cacheService, mock(AiUsageService.class), new ObjectMapper());
    }

    @Test
    void rejectsMessageOver500Chars() {
        ResponseEntity<?> response = controller().generateInsights(
                Map.of("message", "x".repeat(501)), new MockHttpServletRequest());

        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void messageAt500CharsPassesLengthCheck() {
        // agentUrl is unset in a bare unit test, so a valid-length message
        // must fall through the length check to the 503 "not configured" path
        ResponseEntity<?> response = controller().generateInsights(
                Map.of("message", "x".repeat(500)), new MockHttpServletRequest());

        assertEquals(503, response.getStatusCode().value());
    }

    @Test
    void rejectsCurrentRouteOver25Waypoints() {
        List<Map<String, Object>> route = java.util.stream.IntStream.range(0, 26)
                .<Map<String, Object>>mapToObj(i -> Map.of("name", "wp" + i, "latitude", 50.0, "longitude", 30.0))
                .toList();

        ResponseEntity<?> response = controller().generateInsights(
                Map.of("message", "add a stop", "currentRoute", route), new MockHttpServletRequest());

        assertEquals(400, response.getStatusCode().value());
    }

    @Test
    void currentRouteRequestsBypassCache() {
        // A modification answer depends on the caller's current route, so it
        // must be neither served from nor written to the shared cache.
        AiInsightsController controller = controller();
        ReflectionTestUtils.setField(controller, "agentUrl", "http://localhost:1");

        controller.generateInsights(
                Map.of("message", "add a stop in Ternopil",
                        "currentRoute", List.of(
                                Map.of("name", "Lviv", "latitude", 49.84, "longitude", 24.03),
                                Map.of("name", "Kyiv", "latitude", 50.45, "longitude", 30.52))),
                new MockHttpServletRequest());

        verify(cacheService, never()).get(anyString());
        verify(cacheService, never()).put(anyString(), anyString());
    }

    @Test
    void nonListCurrentRouteIsIgnored() {
        // Garbage in the optional field must not crash the endpoint — a
        // valid-length message still reaches the 503 "not configured" path
        ResponseEntity<?> response = controller().generateInsights(
                Map.of("message", "Kyiv to Lviv", "currentRoute", "garbage"),
                new MockHttpServletRequest());

        assertEquals(503, response.getStatusCode().value());
    }

    @Test
    void settingsContextDoesNotBreakValidation() {
        // agentUrl points at an unreachable localhost port so the call fails
        // fast; reaching the agent-call stage (500) proves the new field
        // passed request validation rather than being rejected upstream
        AiInsightsController controller = controller();
        ReflectionTestUtils.setField(controller, "agentUrl", "http://localhost:1");

        ResponseEntity<?> response = controller.generateInsights(
                Map.of("message", "Kyiv to Lviv",
                        "settingsContext", Map.of("fuel_type", "diesel", "currency", "EUR")),
                new MockHttpServletRequest());

        assertEquals(500, response.getStatusCode().value());
    }
}
