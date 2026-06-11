package com.tripplanner.TripPlanner.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Locks the JSON contract between the Python agent's ParseRouteResponse
 * and the Spring-side AgentResponse DTO, and the cacheability decision
 * (only valid successful responses may be cached).
 */
class AgentResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void successfulAgentResponse_isValid() throws Exception {
        String json = """
                {
                  "success": true,
                  "route": {
                    "waypoints": [
                      {"positionOrder": 0, "name": "Kyiv", "latitude": 50.45, "longitude": 30.52},
                      {"positionOrder": 1, "name": "Lviv", "latitude": 49.84, "longitude": 24.03}
                    ],
                    "settings": {"passengers": 1, "fuelConsumption": 6.0, "fuelCostPerLiter": 50.0, "currency": "UAH"}
                  },
                  "message": "Route created with 2 waypoint(s)",
                  "stats": {"totalRequested": 2, "successful": 2, "skipped": 0, "aiProvided": 0, "nominatimProvided": 2, "recovered": 0}
                }
                """;

        AgentResponse response = objectMapper.readValue(json, AgentResponse.class);

        assertTrue(response.isValid());
        assertEquals("Route created with 2 waypoint(s)", response.getMessage());
    }

    @Test
    void failedAgentResponse_isNotValid() throws Exception {
        String json = """
                {"success": false, "route": null, "error": "Need at least 2 valid locations, found 1"}
                """;

        AgentResponse response = objectMapper.readValue(json, AgentResponse.class);

        assertFalse(response.isValid());
        assertEquals("Need at least 2 valid locations, found 1", response.getError());
    }

    @Test
    void successWithoutRoute_isNotValid() throws Exception {
        String json = """
                {"success": true, "route": null}
                """;

        assertFalse(objectMapper.readValue(json, AgentResponse.class).isValid());
    }

    @Test
    void unknownFields_areIgnored() throws Exception {
        String json = """
                {"success": false, "error": "x", "skippedLocations": [{"name": "Xyzzy", "reason": "not found"}], "futureField": 42}
                """;

        AgentResponse response = objectMapper.readValue(json, AgentResponse.class);

        assertFalse(response.isValid());
    }
}
