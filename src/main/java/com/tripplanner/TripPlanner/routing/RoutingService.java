package com.tripplanner.TripPlanner.routing;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RoutingService {

    private final RestTemplate restTemplate;
    private final String mapboxAccessToken;

    // Mapbox as primary provider (reliable, fast, 100k free requests/month)
    // OSRM as fallback (free but currently overloaded)
    private final List<String> osrmServers = List.of(
        "https://router.project-osrm.org",
        "https://routing.openstreetmap.de/routed-car"
    );

    public RoutingService() {
        // Get Mapbox token from environment
        this.mapboxAccessToken = System.getenv("MAPBOX_ACCESS_TOKEN");
        if (mapboxAccessToken == null || mapboxAccessToken.isBlank()) {
            log.warn("MAPBOX_ACCESS_TOKEN not set - Mapbox routing will be disabled, falling back to OSRM");
        } else {
            log.info("Mapbox routing enabled with token: {}...", mapboxAccessToken.substring(0, 10));
        }

        // Configure RestTemplate with reasonable timeouts
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);  // 5 seconds to establish connection
        factory.setReadTimeout(10000);    // 10 seconds to read response

        this.restTemplate = new RestTemplate(factory);
        this.restTemplate.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().add("Accept", "application/json");
            return execution.execute(request, body);
        });
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> calculateRoute(List<RoutingController.Waypoint> waypoints) {
        if (waypoints.size() < 2) {
            return Map.of(
                "totalDistance", 0,
                "totalDuration", 0,
                "geometry", Collections.emptyList(),
                "segments", Collections.emptyList()
            );
        }

        // Build coordinates string
        String coordinates = waypoints.stream()
            .map(w -> w.lng() + "," + w.lat())
            .collect(Collectors.joining(";"));

        // Try Mapbox first (if token is available)
        if (mapboxAccessToken != null && !mapboxAccessToken.isBlank()) {
            Map<String, Object> mapboxResult = tryMapbox(coordinates);
            if (mapboxResult != null) {
                return mapboxResult;
            }
            log.warn("Mapbox routing failed, falling back to OSRM...");
        }

        // Fallback to OSRM servers
        for (int i = 0; i < osrmServers.size(); i++) {
            Map<String, Object> osrmResult = tryOSRM(osrmServers.get(i), coordinates, i + 1);
            if (osrmResult != null) {
                return osrmResult;
            }
        }

        log.error("All routing providers failed. Using straight-line fallback.");
        return createFallbackResponse(waypoints);
    }

    private Map<String, Object> tryMapbox(String coordinates) {
        String url = "https://api.mapbox.com/directions/v5/mapbox/driving/" + coordinates +
            "?access_token=" + mapboxAccessToken +
            "&geometries=geojson&overview=full";

        log.info("Attempting route from Mapbox Directions API");

        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> data = response.getBody();

                if ("Ok".equals(data.get("code")) &&
                    data.containsKey("routes") &&
                    !((List<?>) data.get("routes")).isEmpty()) {

                    Map<String, Object> route = (Map<String, Object>) ((List<?>) data.get("routes")).get(0);
                    Map<String, Object> geometry = (Map<String, Object>) route.get("geometry");

                    if (geometry != null && geometry.containsKey("coordinates")) {
                        List<List<Double>> coordinates_raw = (List<List<Double>>) geometry.get("coordinates");

                        // Convert [lng, lat] to [lat, lng] for Leaflet
                        List<List<Double>> geometryLatLng = coordinates_raw.stream()
                            .map(coord -> List.of(coord.get(1), coord.get(0)))
                            .toList();

                        double distance = ((Number) route.get("distance")).doubleValue() / 1000; // km
                        double duration = ((Number) route.get("duration")).doubleValue() / 60; // minutes

                        log.info("✅ Mapbox route found! Distance: {} km, Duration: {} min, Points: {}",
                            String.format("%.2f", distance),
                            String.format("%.0f", duration),
                            geometryLatLng.size());

                        return Map.of(
                            "totalDistance", distance,
                            "totalDuration", duration,
                            "geometry", geometryLatLng,
                            "segments", Collections.emptyList()
                        );
                    }
                }
            }

            log.warn("Mapbox returned unusable response");
        } catch (Exception e) {
            log.warn("Mapbox request failed: {}", e.getMessage());
        }

        return null;
    }

    private Map<String, Object> tryOSRM(String server, String coordinates, int serverNumber) {
        String url = server + "/route/v1/driving/" + coordinates +
            "?overview=full&geometries=geojson&steps=false";

        log.info("Attempting route from OSRM server {}/{}: {}", serverNumber, osrmServers.size(), server);

        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> data = response.getBody();

                if ("Ok".equals(data.get("code")) &&
                    data.containsKey("routes") &&
                    !((List<?>) data.get("routes")).isEmpty()) {

                    Map<String, Object> route = (Map<String, Object>) ((List<?>) data.get("routes")).get(0);
                    Map<String, Object> geometry = (Map<String, Object>) route.get("geometry");

                    if (geometry != null && geometry.containsKey("coordinates")) {
                        List<List<Double>> coordinates_raw = (List<List<Double>>) geometry.get("coordinates");

                        // Convert [lng, lat] to [lat, lng] for Leaflet
                        List<List<Double>> geometryLatLng = coordinates_raw.stream()
                            .map(coord -> List.of(coord.get(1), coord.get(0)))
                            .toList();

                        double distance = ((Number) route.get("distance")).doubleValue() / 1000; // km
                        double duration = ((Number) route.get("duration")).doubleValue() / 60; // minutes

                        log.info("✅ OSRM route found! Distance: {} km, Duration: {} min, Points: {}",
                            String.format("%.2f", distance),
                            String.format("%.0f", duration),
                            geometryLatLng.size());

                        return Map.of(
                            "totalDistance", distance,
                            "totalDuration", duration,
                            "geometry", geometryLatLng,
                            "segments", Collections.emptyList()
                        );
                    }
                }
            }

            log.warn("OSRM server {} returned unusable response", serverNumber);
        } catch (Exception e) {
            log.warn("OSRM server {} failed: {}", serverNumber, e.getMessage());
        }

        return null;
    }

    private Map<String, Object> createFallbackResponse(List<RoutingController.Waypoint> waypoints) {
        List<List<Double>> fallbackGeometry = waypoints.stream()
            .map(w -> List.of(w.lat(), w.lng()))
            .toList();

        return Map.of(
            "totalDistance", 0,
            "totalDuration", 0,
            "geometry", fallbackGeometry,
            "segments", Collections.emptyList()
        );
    }
}
