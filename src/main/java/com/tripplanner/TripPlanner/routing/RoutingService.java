package com.tripplanner.TripPlanner.routing;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RoutingService {

    static final int MAPBOX_MAX_COORDINATES = 25;

    private static final String DEFAULT_MAPBOX_REQUEST_ORIGIN = "https://trip-calculate.online";

    // How far a provider may move a requested point onto the road network before
    // the route is treated as not reaching it. Villages and trailheads snap well
    // within this; another continent does not.
    static final double MAX_SNAP_METERS = 10_000;

    /** Returned (by identity) when no drivable route connects the waypoints. */
    static final Map<String, Object> NO_ROUTE = Map.of(
        "noRoute", true,
        "totalDistance", 0,
        "totalDuration", 0,
        "geometry", Collections.emptyList(),
        "segments", Collections.emptyList()
    );

    private final RestTemplate restTemplate;
    private final String mapboxAccessToken;
    private final String mapboxRequestOrigin;

    // Mapbox as primary provider (reliable, fast, 100k free requests/month)
    // OSRM as fallback (free but currently overloaded)
    private final List<String> osrmServers = List.of(
        "https://router.project-osrm.org",
        "https://routing.openstreetmap.de/routed-car"
    );

    public RoutingService() {
        this(
            createRestTemplate(),
            System.getenv("MAPBOX_ACCESS_TOKEN"),
            Optional.ofNullable(System.getenv("MAPBOX_REQUEST_ORIGIN"))
                .filter(origin -> !origin.isBlank())
                .orElse(DEFAULT_MAPBOX_REQUEST_ORIGIN)
        );
    }

    RoutingService(RestTemplate restTemplate, String mapboxAccessToken, String mapboxRequestOrigin) {
        this.restTemplate = restTemplate;
        this.mapboxAccessToken = mapboxAccessToken;
        this.mapboxRequestOrigin = mapboxRequestOrigin.endsWith("/")
            ? mapboxRequestOrigin.substring(0, mapboxRequestOrigin.length() - 1)
            : mapboxRequestOrigin;

        if (mapboxAccessToken == null || mapboxAccessToken.isBlank()) {
            log.warn("MAPBOX_ACCESS_TOKEN not set - Mapbox routing will be disabled, falling back to OSRM");
        } else {
            // Validate token format (Mapbox tokens start with 'pk.' or 'sk.')
            if (!mapboxAccessToken.startsWith("pk.") && !mapboxAccessToken.startsWith("sk.")) {
                log.error("Invalid Mapbox token format! Token should start with 'pk.' or 'sk.'");
            } else {
                // Never log any part of the token.
                log.info("Mapbox routing enabled");
            }
        }
    }

    private static RestTemplate createRestTemplate() {
        // Configure RestTemplate with reasonable timeouts
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);  // 5 seconds to establish connection
        factory.setReadTimeout(10000);    // 10 seconds to read response

        RestTemplate restTemplate = new RestTemplate(factory);
        restTemplate.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().add("Accept", "application/json");
            request.getHeaders().add("User-Agent", "TripPlanner/1.0");
            return execution.execute(request, body);
        });
        return restTemplate;
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

        // Set when a provider answers "no road connects these points" (Mapbox
        // NoRoute/NoSegment) or returns a route that fails validateReach. Then the
        // only honest answer is "no route" — never a straight line with a cost.
        boolean unreachable = false;

        // Try Mapbox first (if token is available). Its Directions API takes at most
        // 25 coordinates; longer routes go straight to OSRM instead of failing there.
        if (mapboxAccessToken != null && !mapboxAccessToken.isBlank()
                && waypoints.size() <= MAPBOX_MAX_COORDINATES) {
            Map<String, Object> mapboxResult = tryMapbox(coordinates, waypoints);
            if (mapboxResult == NO_ROUTE) {
                unreachable = true;
            } else if (mapboxResult != null) {
                return mapboxResult;
            }
            log.warn("Mapbox routing failed, falling back to OSRM...");
        }

        // Fallback to OSRM servers. They get the same validation, so a fallback can
        // never "succeed" with a route Mapbox correctly refused.
        for (int i = 0; i < osrmServers.size(); i++) {
            Map<String, Object> osrmResult = tryOSRM(osrmServers.get(i), coordinates, waypoints, i + 1);
            if (osrmResult == NO_ROUTE) {
                unreachable = true;
            } else if (osrmResult != null) {
                return osrmResult;
            }
        }

        if (unreachable) {
            log.warn("No drivable route between the requested waypoints");
            return NO_ROUTE;
        }
        log.error("All routing providers failed. Using straight-line fallback.");
        return createFallbackResponse(waypoints);
    }

    /**
     * A provider can return "Ok" for points no road reaches: the public OSRM
     * server snapped Vancouver to western Ireland (7,960 km away) and routed
     * Kyiv there. Reject a route when any waypoint was moved further than
     * MAX_SNAP_METERS onto the road network (providers report it per waypoint),
     * or when the geometry starts or ends that far from the requested points.
     */
    @SuppressWarnings("unchecked")
    static boolean reachesWaypoints(Map<String, Object> data, List<List<Double>> geometryLatLng,
                                    List<RoutingController.Waypoint> waypoints) {
        Object snapped = data.get("waypoints");
        if (snapped instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> point && point.get("distance") instanceof Number meters
                        && meters.doubleValue() > MAX_SNAP_METERS) {
                    return false;
                }
            }
        }
        List<Double> start = geometryLatLng.get(0);
        List<Double> end = geometryLatLng.get(geometryLatLng.size() - 1);
        RoutingController.Waypoint first = waypoints.get(0);
        RoutingController.Waypoint last = waypoints.get(waypoints.size() - 1);
        return metersBetween(start.get(0), start.get(1), first.lat(), first.lng()) <= MAX_SNAP_METERS
                && metersBetween(end.get(0), end.get(1), last.lat(), last.lng()) <= MAX_SNAP_METERS;
    }

    private static double metersBetween(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private Map<String, Object> tryMapbox(String coordinates, List<RoutingController.Waypoint> waypoints) {
        String url = "https://api.mapbox.com/directions/v5/mapbox/driving/" + coordinates +
            "?access_token=" + mapboxAccessToken +
            "&geometries=geojson" +
            "&overview=full" +
            "&steps=false" +
            "&alternatives=false";

        log.info("🗺️ Attempting route from Mapbox Directions API");
        log.debug("Mapbox URL: {}", url.replace(mapboxAccessToken, "***TOKEN***"));

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setOrigin(mapboxRequestOrigin);
            headers.set(HttpHeaders.REFERER, mapboxRequestOrigin + "/");

            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.exchange(
                url,
                HttpMethod.GET,
                new HttpEntity<>(headers),
                Map.class
            );

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
                            log.warn("Mapbox could not find a route between the waypoints");
                            return NO_ROUTE;
                        case "NoSegment":
                            log.warn("No road segment found near the coordinates");
                            return NO_ROUTE;
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

            if (!reachesWaypoints(data, geometryLatLng, waypoints)) {
                log.warn("Mapbox route does not reach the requested waypoints");
                return NO_ROUTE;
            }

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
            String body = e.getResponseBodyAsString();
            // Mapbox answers 422 with {"code":"NoSegment"|"NoRoute"} for points no road reaches.
            if (body.contains("\"NoSegment\"") || body.contains("\"NoRoute\"")) {
                log.warn("Mapbox found no road route: {}", e.getStatusCode());
                return NO_ROUTE;
            }
            log.error("Mapbox HTTP client error: {} - {}", e.getStatusCode(), body);
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

    private Map<String, Object> tryOSRM(String server, String coordinates,
                                        List<RoutingController.Waypoint> waypoints, int serverNumber) {
        String url = server + "/route/v1/driving/" + coordinates +
            "?overview=full&geometries=geojson&steps=false";

        log.info("Attempting route from OSRM server {}/{}: {}", serverNumber, osrmServers.size(), server);

        try {
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> data = response.getBody();

                if ("NoRoute".equals(data.get("code")) || "NoSegment".equals(data.get("code"))) {
                    return NO_ROUTE;
                }
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

                        if (geometryLatLng.isEmpty() || !reachesWaypoints(data, geometryLatLng, waypoints)) {
                            log.warn("OSRM server {} route does not reach the requested waypoints", serverNumber);
                            return NO_ROUTE;
                        }

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
