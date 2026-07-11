package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * Thin authenticated proxy to the agent's deterministic corridor-forecast
 * endpoint. Weather is advisory end-to-end: an unreachable or failing agent
 * is a 200 with weather_data=null, never a user-visible error.
 */
@RestController
@RequestMapping("/api/weather")
public class WeatherProxyController {

    private static final Logger logger = LoggerFactory.getLogger(WeatherProxyController.class);

    // Mirror the agent's WeatherCorridorRequest bounds and Open-Meteo's window
    private static final int MAX_WAYPOINTS = 25;
    private static final int FORECAST_WINDOW_DAYS = 16;
    private static final String NULL_WEATHER = "{\"weather_data\":null}";

    @Value("${agent.url:}")
    private String agentUrl;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WeatherProxyController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        // HTTP/1.1 pinned: uvicorn drops POST bodies on h2c upgrade
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @PostMapping("/corridor")
    public ResponseEntity<String> corridor(@RequestBody CorridorRequest request) {
        String invalid = validate(request);
        if (invalid != null) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"" + invalid + "\"}");
        }
        if (agentUrl == null || agentUrl.isEmpty()) {
            return nullWeather();
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "waypoints", request.waypoints(), "date", request.date()));
            HttpRequest agentRequest = HttpRequest.newBuilder()
                    .uri(URI.create(agentUrl + "/weather-corridor"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(
                    agentRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                return ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(response.body());
            }
            logger.warn("weather agent returned {}", response.statusCode());
            return nullWeather();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return nullWeather();
        } catch (Exception e) {
            logger.warn("weather agent unreachable: {}", e.getClass().getSimpleName());
            return nullWeather();
        }
    }

    private static ResponseEntity<String> nullWeather() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(NULL_WEATHER);
    }

    private static String validate(CorridorRequest request) {
        if (request.waypoints() == null || request.waypoints().isEmpty()
                || request.waypoints().size() > MAX_WAYPOINTS) {
            return "waypoints must contain 1-" + MAX_WAYPOINTS + " entries";
        }
        for (CorridorWaypoint wp : request.waypoints()) {
            if (wp.name() == null || wp.name().isBlank()
                    || wp.latitude() < -90 || wp.latitude() > 90
                    || wp.longitude() < -180 || wp.longitude() > 180) {
                return "invalid waypoint";
            }
        }
        LocalDate day;
        try {
            day = LocalDate.parse(request.date());
        } catch (DateTimeParseException | NullPointerException e) {
            return "date must be YYYY-MM-DD";
        }
        LocalDate today = LocalDate.now();
        if (day.isBefore(today) || day.isAfter(today.plusDays(FORECAST_WINDOW_DAYS))) {
            return "date outside forecast window";
        }
        return null;
    }

    public record CorridorRequest(List<CorridorWaypoint> waypoints, String date) {}

    public record CorridorWaypoint(String name, double latitude, double longitude) {}
}
