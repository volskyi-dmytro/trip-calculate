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

    @PostMapping("/calculate")
    public ResponseEntity<Map<String, Object>> calculateRoute(@RequestBody RouteRequest request) {
        log.info("Calculating route for {} waypoints", request.waypoints().size());

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

    public record RouteRequest(List<Waypoint> waypoints) {}

    public record Waypoint(double lat, double lng) {}
}
