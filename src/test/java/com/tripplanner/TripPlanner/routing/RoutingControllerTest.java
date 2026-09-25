package com.tripplanner.TripPlanner.routing;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RoutingControllerTest {

    private final RoutingService routingService = mock(RoutingService.class);
    private final RoutingController controller = new RoutingController(routingService);

    private static List<RoutingController.Waypoint> points(int n) {
        return IntStream.range(0, n).mapToObj(i -> new RoutingController.Waypoint(50.0 + i * 0.01, 30.0)).toList();
    }

    @Test
    void acceptsLongRoutesThatGoToOsrmInsteadOfMapbox() {
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of("totalDistance", 1));

        ResponseEntity<Map<String, Object>> response = controller.calculateRoute(
                new RoutingController.RouteRequest(points(100)));

        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void rejectsAbsurdlyLongRoutesBeforeCallingAnyProvider() {
        ResponseEntity<Map<String, Object>> response = controller.calculateRoute(
                new RoutingController.RouteRequest(points(101)));

        assertEquals(400, response.getStatusCode().value());
        verify(routingService, never()).calculateRoute(anyList());
    }

    @Test
    void rejectsMissingTooFewOrImpossibleCoordinates() {
        assertEquals(400, controller.calculateRoute(new RoutingController.RouteRequest(null)).getStatusCode().value());
        assertEquals(400, controller.calculateRoute(new RoutingController.RouteRequest(points(1))).getStatusCode().value());
        assertEquals(400, controller.calculateRoute(new RoutingController.RouteRequest(List.of(
                new RoutingController.Waypoint(91, 30), new RoutingController.Waypoint(50, 30)))).getStatusCode().value());
        assertEquals(400, controller.calculateRoute(new RoutingController.RouteRequest(List.of(
                new RoutingController.Waypoint(50, Double.NaN), new RoutingController.Waypoint(50, 30)))).getStatusCode().value());
        verify(routingService, never()).calculateRoute(anyList());
    }
}
