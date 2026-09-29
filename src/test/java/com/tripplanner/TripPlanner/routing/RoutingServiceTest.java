package com.tripplanner.TripPlanner.routing;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class RoutingServiceTest {

    @Test
    void sendsConfiguredApplicationOriginToMapboxForUrlRestrictedToken() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        RoutingService service = new RoutingService(
            restTemplate,
            "pk.test-token",
            "https://trip-calculate.online"
        );

        server.expect(requestTo(org.hamcrest.Matchers.startsWith(
                "https://api.mapbox.com/directions/v5/mapbox/driving/")))
            .andExpect(header(HttpHeaders.ORIGIN, "https://trip-calculate.online"))
            .andExpect(header(HttpHeaders.REFERER, "https://trip-calculate.online/"))
            .andRespond(withSuccess("""
                {
                  "code": "Ok",
                  "routes": [{
                    "distance": 1000,
                    "duration": 600,
                    "geometry": {"coordinates": [[30.5, 50.4], [24.0, 49.8]]}
                  }]
                }
                """, MediaType.APPLICATION_JSON));

        var result = service.calculateRoute(List.of(
            new RoutingController.Waypoint(50.4, 30.5),
            new RoutingController.Waypoint(49.8, 24.0)
        ));

        assertThat(result.get("totalDistance")).isEqualTo(1.0);
        server.verify();
    }

    @Test
    void skipsMapboxAboveItsTwentyFiveCoordinateLimit() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        RoutingService service = new RoutingService(restTemplate, "pk.test-token", "https://trip-calculate.online");
        List<RoutingController.Waypoint> thirty = java.util.stream.IntStream.range(0, 30)
                .mapToObj(i -> new RoutingController.Waypoint(50.0 + i * 0.01, 30.0)).toList();

        // The first request must go straight to OSRM, not to Mapbox.
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://router.project-osrm.org/")))
            .andRespond(withSuccess("""
                {"code": "Ok", "routes": [{"distance": 1000, "duration": 600,
                  "geometry": {"coordinates": [[30.0, 50.0], [30.0, 50.29]]}}]}
                """, MediaType.APPLICATION_JSON));

        service.calculateRoute(thirty);

        server.verify();
    }

    private static final List<RoutingController.Waypoint> KYIV_VANCOUVER = List.of(
        new RoutingController.Waypoint(50.4500336, 30.5241361),
        new RoutingController.Waypoint(49.2608724, -123.113952));

    // Real public OSRM answer for Kyiv -> Vancouver (2026-09-29): "Ok", with
    // Vancouver snapped 7,960 km away to western Ireland.
    private static final String OSRM_KYIV_TO_IRELAND = """
        {"code":"Ok",
         "waypoints":[{"distance":2.1,"location":[30.524153,50.450024]},
                      {"distance":7960496.0,"location":[-10.46986,52.150137]}],
         "routes":[{"distance":3353219.3,"duration":147082.3,
                    "geometry":{"coordinates":[[30.524153,50.450024],[-10.46986,52.150137]]}}]}
        """;

    @Test
    void rejectsAnOsrmRouteThatSnapsTheDestinationToAnotherContinent() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        RoutingService service = new RoutingService(restTemplate, "", "https://trip-calculate.online");
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://router.project-osrm.org/")))
            .andRespond(withSuccess(OSRM_KYIV_TO_IRELAND, MediaType.APPLICATION_JSON));
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://routing.openstreetmap.de/")))
            .andRespond(withSuccess(OSRM_KYIV_TO_IRELAND, MediaType.APPLICATION_JSON));

        var result = service.calculateRoute(KYIV_VANCOUVER);

        assertThat(result.get("noRoute")).isEqualTo(true);
        assertThat(result.get("totalDistance")).isEqualTo(0);
        assertThat((List<?>) result.get("geometry")).isEmpty();
    }

    @Test
    void mapboxNoRouteIsNotOverriddenByAFallbackRouteThatFailsValidation() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        RoutingService service = new RoutingService(restTemplate, "pk.test-token", "https://trip-calculate.online");
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://api.mapbox.com/")))
            .andRespond(withSuccess("{\"code\":\"NoRoute\",\"message\":\"No route found\",\"routes\":[]}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://router.project-osrm.org/")))
            .andRespond(withSuccess(OSRM_KYIV_TO_IRELAND, MediaType.APPLICATION_JSON));
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://routing.openstreetmap.de/")))
            .andRespond(withSuccess(OSRM_KYIV_TO_IRELAND, MediaType.APPLICATION_JSON));

        var result = service.calculateRoute(KYIV_VANCOUVER);

        assertThat(result.get("noRoute")).isEqualTo(true);
        server.verify();
    }

    @Test
    void rejectsARouteWhoseGeometryStopsShortEvenWithoutSnapDistances() {
        List<List<Double>> endsInWarsaw = List.of(List.of(50.45, 30.52), List.of(52.23, 21.01));
        assertThat(RoutingService.reachesWaypoints(java.util.Map.of(), endsInWarsaw, List.of(
            new RoutingController.Waypoint(50.45, 30.52),
            new RoutingController.Waypoint(50.06, 19.94)))).isFalse();
    }

    @Test
    void acceptsANormalRouteWithSmallSnapDistances() {
        java.util.Map<String, Object> data = java.util.Map.of("waypoints", List.of(
            java.util.Map.of("distance", 35.0), java.util.Map.of("distance", 1200.0)));
        List<List<Double>> kyivKrakow = List.of(List.of(50.4502, 30.5241), List.of(50.0640, 19.9460));
        assertThat(RoutingService.reachesWaypoints(data, kyivKrakow, List.of(
            new RoutingController.Waypoint(50.4501, 30.5234),
            new RoutingController.Waypoint(50.0647, 19.9450)))).isTrue();
    }
}
