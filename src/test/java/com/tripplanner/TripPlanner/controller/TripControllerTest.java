package com.tripplanner.TripPlanner.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TripControllerTest {

    private final TripController controller = new TripController();

    @Test
    void passengerCountMeansTotalPeopleLikeThePublicCalculator() {
        ResponseEntity<?> response = controller.calculateTrip(Map.of(
                "customFuelConsumption", 10,
                "numberOfPassengers", 2,
                "distance", 100,
                "fuelCost", 2
        ));

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();

        assertEquals(200, response.getStatusCode().value());
        assertEquals(20.0, (Double) body.get("totalFuelCost"), 0.001);
        assertEquals(10.0, (Double) body.get("costPerPassenger"), 0.001);
        assertEquals(2, body.get("numberOfPeople"));
    }

    @Test
    void rejectsZeroPassengers() {
        ResponseEntity<?> response = controller.calculateTrip(Map.of(
                "customFuelConsumption", 10,
                "numberOfPassengers", 0,
                "distance", 100,
                "fuelCost", 2
        ));

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();

        assertEquals(400, response.getStatusCode().value());
        assertTrue(((String) body.get("error")).contains("positive"));
    }
}
