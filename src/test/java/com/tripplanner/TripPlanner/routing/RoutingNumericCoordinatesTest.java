package com.tripplanner.TripPlanner.routing;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class RoutingNumericCoordinatesTest {

    @ParameterizedTest
    @CsvSource({"mapbox,reversed", "osrm,reversed", "mapbox,distant", "osrm,distant",
        "mapbox,snapped", "osrm,snapped"})
    void numericCoordinatesStillRequireAReachableRoute(String provider, String invalidRoute) {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        String coordinates = switch (invalidRoute) {
            case "reversed" -> "[[15,51.0],[14.0,50]]";
            case "distant" -> "[[14,50.0],[20.0,55]]";
            default -> "[[14,50.0],[15.0,51]]";
        };
        String response = """
            {"code":"Ok","waypoints":[{"distance":1},{"distance":%d}],
             "routes":[{"distance":188690,"duration":9060,
               "geometry":{"type":"LineString","coordinates":%s}}]}
            """.formatted(invalidRoute.equals("snapped") ? 10001 : 2, coordinates);
        if (provider.equals("mapbox")) {
            server.expect(requestTo(startsWith("https://api.mapbox.com/")))
                .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        }
        // Both fallbacks must reject the same invalid numeric geometry too.
        server.expect(requestTo(startsWith("https://router.project-osrm.org/")))
            .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        server.expect(requestTo(startsWith("https://routing.openstreetmap.de/")))
            .andRespond(withSuccess(response, MediaType.APPLICATION_JSON));

        var result = new RoutingService(restTemplate, provider.equals("mapbox") ? "pk.test" : "",
            "https://trip-calculate.online").calculateRoute(List.of(
                new RoutingController.Waypoint(50, 14), new RoutingController.Waypoint(51, 15)));

        assertThat(result).isSameAs(RoutingService.NO_ROUTE);
        assertThat(result).containsEntry("quality", "noRoute").containsEntry("totalDistance", 0);
        assertThat((List<?>) result.get("geometry")).isEmpty();
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"mapbox,false", "mapbox,true", "osrm,false", "osrm,true"})
    void acceptsIntegerAndMixedGeoJsonCoordinates(String provider, boolean mixed) {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        String coordinates = mixed ? "[[14,50.0],[14.5,50],[15.0,51]]"
            : "[[14,50],[15,51]]";
        String host = provider.equals("mapbox") ? "https://api.mapbox.com/"
            : "https://router.project-osrm.org/";
        server.expect(requestTo(startsWith(host)))
            .andRespond(withSuccess("""
                {"code":"Ok","waypoints":[{"distance":1},{"distance":2}],
                 "routes":[{"distance":188690,"duration":9060,
                   "geometry":{"type":"LineString","coordinates":%s}}]}
                """.formatted(coordinates), MediaType.APPLICATION_JSON));
        // If parsing fails, isolate the bug from any live network fallback.
        if (provider.equals("mapbox")) {
            server.expect(org.springframework.test.web.client.ExpectedCount.between(0, 1),
                    requestTo(startsWith("https://router.project-osrm.org/")))
                .andRespond(withServerError());
        }
        server.expect(org.springframework.test.web.client.ExpectedCount.between(0, 1),
                requestTo(startsWith("https://routing.openstreetmap.de/")))
            .andRespond(withServerError());

        var result = new RoutingService(restTemplate, provider.equals("mapbox") ? "pk.test" : "",
            "https://trip-calculate.online").calculateRoute(List.of(
                new RoutingController.Waypoint(50, 14), new RoutingController.Waypoint(51, 15)));

        assertThat(result).containsEntry("quality", "road").containsEntry("provider", provider)
            .containsEntry("totalDistance", 188.69).containsEntry("totalDuration", 151.0);
        assertThat(result.get("geometry")).isEqualTo(mixed
            ? List.of(List.of(50.0, 14.0), List.of(50.0, 14.5), List.of(51.0, 15.0))
            : List.of(List.of(50.0, 14.0), List.of(51.0, 15.0)));
        server.verify();
    }
}
