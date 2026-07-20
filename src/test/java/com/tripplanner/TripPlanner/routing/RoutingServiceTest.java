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
}
