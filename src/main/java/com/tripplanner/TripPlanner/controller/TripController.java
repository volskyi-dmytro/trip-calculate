package com.tripplanner.TripPlanner.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Controller
public class TripController {

    // @GetMapping("/")
    // public String showLandingPage(Model model) {
    //     return "index"; // Serve the static landing page
    // }

    // Add the /calculate endpoint that your JavaScript expects
    @PostMapping("/calculate")
    @ResponseBody
    public ResponseEntity<?> calculateTrip(@RequestBody Map<String, Object> request) {
        try {
            // Extract values from request
            Double customFuelConsumption = getDoubleValue(request, "customFuelConsumption");
            Integer numberOfPassengers = getIntegerValue(request, "numberOfPassengers");
            Double distance = getDoubleValue(request, "distance");
            Double fuelCost = getDoubleValue(request, "fuelCost");

            // Validate inputs
            if (customFuelConsumption == null || customFuelConsumption <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Custom fuel consumption must be a positive number"));
            }
            if (numberOfPassengers == null || numberOfPassengers < 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Number of passengers cannot be negative"));
            }
            if (distance == null || distance <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Distance must be a positive number"));
            }
            if (fuelCost == null || fuelCost <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Fuel cost must be a positive number"));
            }

            // Calculate total fuel needed (liters)
            double totalFuelNeeded = (customFuelConsumption * distance) / 100.0;

            // Calculate total cost
            double totalFuelCost = totalFuelNeeded * fuelCost;

            // Calculate cost per person (including driver)
            int totalPeople = numberOfPassengers + 1; // +1 for driver
            double costPerPassenger = totalFuelCost / totalPeople;

            // Return calculation results matching your JavaScript expectations
            return ResponseEntity.ok(Map.of(
                    "totalFuelCost", totalFuelCost,
                    "costPerPassenger", costPerPassenger,
                    "totalFuelNeeded", totalFuelNeeded,
                    "numberOfPeople", totalPeople
            ));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid input data: " + e.getMessage()));
        }
    }

    // Helper methods for safe value extraction
    private Double getDoubleValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) return null;
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer getIntegerValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) return null;
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}