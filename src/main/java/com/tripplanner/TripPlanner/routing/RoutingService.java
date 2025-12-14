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
    private final List<String> osrmServers = List.of(
        "https://router.project-osrm.org",
        "https://routing.openstreetmap.de/routed-car"
    );

    public RoutingService() {
        // Configure RestTemplate with aggressive timeouts
        // OSRM public servers are very slow/overloaded, so fail fast and move to next server
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);  // 3 seconds to establish connection
        factory.setReadTimeout(10000);     // 10 seconds to read response
        // Total max wait per server: 13 seconds
        // With 2 servers: max 26 seconds before fallback

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

        // Try each server
        for (int i = 0; i < osrmServers.size(); i++) {
            String server = osrmServers.get(i);
            String url = server + "/route/v1/driving/" + coordinates +
                "?overview=full&geometries=geojson&steps=false";

            log.info("Attempting route from server {}/{}: {}", i + 1, osrmServers.size(), server);

            try {
                @SuppressWarnings("rawtypes")
                ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    @SuppressWarnings("unchecked")
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

                            log.info("Route found! Distance: {} km, Duration: {} min, Points: {}",
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

                log.warn("Server {} returned unusable response", i + 1);
            } catch (Exception e) {
                log.warn("Server {} failed: {}", i + 1, e.getMessage());
            }
        }

        log.error("All routing servers failed. Using straight-line fallback.");
        // Fallback to straight lines
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
