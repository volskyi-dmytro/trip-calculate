package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.service.AiCacheService;
import com.tripplanner.TripPlanner.service.AiUsageService;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

/**
 * Guards the AI proxy's input validation: over-long prompts must be
 * rejected before any usage logging, cache lookup, or agent call —
 * the length cap is the backend's cost-control line of defense.
 */
class AiInsightsControllerTest {

    private AiInsightsController controller() {
        return new AiInsightsController(
                mock(AiCacheService.class), mock(AiUsageService.class), new ObjectMapper());
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
}
