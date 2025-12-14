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
            // Validate token format (Mapbox tokens start with 'pk.' or 'sk.')
            if (!mapboxAccessToken.startsWith("pk.") && !mapboxAccessToken.startsWith("sk.")) {
                log.error("Invalid Mapbox token format! Token should start with 'pk.' or 'sk.'. Current: {}...",
                    mapboxAccessToken.length() > 10 ? mapboxAccessToken.substring(0, 10) : mapboxAccessToken);
            } else {
                log.info("Mapbox routing enabled with token: {}...", mapboxAccessToken.substring(0, 15));
            }
        }

        // Configure RestTemplate with reasonable timeouts
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);  // 5 seconds to establish connection
        factory.setReadTimeout(10000);    // 10 seconds to read response

        this.restTemplate = new RestTemplate(factory);
        this.restTemplate.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().add("Accept", "application/json");
            request.getHeaders().add("User-Agent", "TripPlanner/1.0");
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
            "&geometries=geojson" +
            "&overview=full" +
            "&steps=false" +
            "&alternatives=false";

        log.info("🗺️ Attempting route from Mapbox Directions API");
        log.debug("Mapbox URL: {}", url.replace(mapboxAccessToken, "***TOKEN***"));

        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);

            log.debug("Mapbox response status: {}", response.getStatusCode());

            if (!response.getStatusCode().is2xxSuccessful()) {
                log.warn("Mapbox returned non-2xx status: {}", response.getStatusCode());
                return null;
            }

            if (response.getBody() == null) {
                log.warn("Mapbox returned null body");
                return null;
            }

            Map<String, Object> data = response.getBody();
            log.debug("Mapbox response code: {}", data.get("code"));

            // Check for Mapbox API errors
            if (data.containsKey("code")) {
                String code = (String) data.get("code");
                if (!"Ok".equals(code)) {
                    String message = data.containsKey("message") ? (String) data.get("message") : "Unknown error";
                    log.error("Mapbox API error - Code: {}, Message: {}", code, message);

                    // Common Mapbox error codes
                    switch (code) {
                        case "InvalidInput":
                            log.error("Invalid coordinates or parameters sent to Mapbox");
                            break;
                        case "NoRoute":
                            log.error("Mapbox could not find a route between the waypoints");
                            break;
                        case "NoSegment":
                            log.error("No road segment found near the coordinates");
                            break;
                        case "ProfileNotFound":
                            log.error("Invalid routing profile (should be 'driving')");
                            break;
                        default:
                            log.error("Unhandled Mapbox error code: {}", code);
                    }
                    return null;
                }
            }

            // Parse successful response
            if (!data.containsKey("routes") || ((List<?>) data.get("routes")).isEmpty()) {
                log.warn("Mapbox response missing routes or routes empty");
                return null;
            }

            Map<String, Object> route = (Map<String, Object>) ((List<?>) data.get("routes")).get(0);

            if (!route.containsKey("geometry")) {
                log.warn("Mapbox route missing geometry");
                return null;
            }

            Map<String, Object> geometry = (Map<String, Object>) route.get("geometry");

            if (geometry == null || !geometry.containsKey("coordinates")) {
                log.warn("Mapbox geometry missing coordinates");
                return null;
            }

            List<List<Double>> coordinates_raw = (List<List<Double>>) geometry.get("coordinates");

            if (coordinates_raw == null || coordinates_raw.isEmpty()) {
                log.warn("Mapbox coordinates array is empty");
                return null;
            }

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

        } catch (org.springframework.web.client.HttpClientErrorException e) {
            log.error("Mapbox HTTP client error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 401) {
                log.error("⚠️ AUTHENTICATION FAILED - Check your MAPBOX_ACCESS_TOKEN!");
            } else if (e.getStatusCode().value() == 403) {
                log.error("⚠️ ACCESS FORBIDDEN - Your Mapbox token may not have permission for Directions API");
            } else if (e.getStatusCode().value() == 429) {
                log.error("⚠️ RATE LIMIT EXCEEDED - Too many Mapbox API requests");
            }
        } catch (org.springframework.web.client.ResourceAccessException e) {
            log.error("Mapbox network error: {}", e.getMessage());
        } catch (Exception e) {
            log.error("Mapbox unexpected error: {} - {}", e.getClass().getSimpleName(), e.getMessage());
            log.debug("Stack trace:", e);
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
