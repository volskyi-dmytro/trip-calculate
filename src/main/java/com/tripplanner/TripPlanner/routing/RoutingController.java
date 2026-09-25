package com.tripplanner.TripPlanner.routing;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/routing")
@RequiredArgsConstructor
public class RoutingController {

    private final RoutingService routingService;

    // Mapbox Directions accepts at most 25 coordinates per request. This endpoint
    // is public, so the cap also keeps one call from costing more than one route.
    static final int MAX_WAYPOINTS = 25;

    @PostMapping("/calculate")
    public ResponseEntity<Map<String, Object>> calculateRoute(@RequestBody RouteRequest request) {
        List<Waypoint> waypoints = request == null ? null : request.waypoints();
        if (waypoints == null || waypoints.size() < 2 || waypoints.size() > MAX_WAYPOINTS
                || !waypoints.stream().allMatch(RoutingController::isValid)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", true,
                    "message", "Send 2 to " + MAX_WAYPOINTS + " waypoints with valid coordinates"));
        }
        log.debug("Calculating route for {} waypoints", waypoints.size());

        try {
            Map<String, Object> result = routingService.calculateRoute(request.waypoints());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to calculate route", e);
            return ResponseEntity.ok(Map.of(
                "error", true,
                "message", "Routing service unavailable",
                "fallback", true
            ));
        }
    }

    private static boolean isValid(Waypoint point) {
        return point != null
                && Double.isFinite(point.lat()) && Math.abs(point.lat()) <= 90
                && Double.isFinite(point.lng()) && Math.abs(point.lng()) <= 180;
    }

    public record RouteRequest(List<Waypoint> waypoints) {}

    public record Waypoint(double lat, double lng) {}
}
