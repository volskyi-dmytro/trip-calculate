package com.tripplanner.TripPlanner.routing;

import com.tripplanner.TripPlanner.dto.RouteDTO;
import com.tripplanner.TripPlanner.dto.SaveRouteRequest;
import com.tripplanner.TripPlanner.dto.WaypointDTO;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.WaypointRepository;
import com.tripplanner.TripPlanner.service.RouteService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Uses the REAL RoutingService output shape; only the HTTP providers are stubbed. */
class RouteServiceRealRoutingTest {

    private static final String OK = """
        {"code":"Ok","waypoints":[{"distance":1.0,"location":[14.0,50.0]},{"distance":1.0,"location":[15.0,51.0]}],
         "routes":[{"distance":188690,"duration":9060,"geometry":{"coordinates":[[14.0,50.0],[15.0,51.0]]}}]}
        """;

    private RouteService service(boolean providerUp) {
        RestTemplate rt = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(rt).build();
        if (!providerUp) {
            server.expect(org.springframework.test.web.client.ExpectedCount.manyTimes(), org.springframework.test.web.client.match.MockRestRequestMatchers.anything())
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withServerError());
        } else {
            server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://router.project-osrm.org/")))
                .andRespond(withSuccess(OK, MediaType.APPLICATION_JSON));
        }
        RouteRepository routes = mock(RouteRepository.class);
        when(routes.save(any(Route.class))).thenAnswer(i -> i.getArgument(0));
        return new RouteService(routes, mock(WaypointRepository.class),
            new RoutingService(rt, "", "https://trip-calculate.online"));
    }

    @Test
    void roadSaveWithMatchingSnapshotIsStoredAsRoad() {
        RouteDTO saved = service(true).saveRoute(request("188.69", "road"), 7L);
        assertThat(saved.getDistanceQuality()).isEqualTo("road");
        assertThat(saved.getDistanceSource()).isEqualTo("osrm");
        assertThat(saved.getTotalDistance()).isEqualByComparingTo("188.69");
    }

    @Test
    void providerOutageIsStoredAsApproximate() {
        RouteDTO saved = service(false).saveRoute(request(null, null), 7L);
        assertThat(saved.getDistanceQuality()).isEqualTo("approximate");
        assertThat(saved.getDistanceSource()).isEqualTo("straight-line");
    }

    @Test
    void mismatchingSnapshotIsRejected() {
        assertThatThrownBy(() -> service(true).saveRoute(request("100.00", "road"), 7L))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private SaveRouteRequest request(String km, String quality) {
        SaveRouteRequest r = new SaveRouteRequest();
        r.setName("A - B");
        r.setFuelConsumption(new BigDecimal("10.0"));
        r.setFuelCostPerLiter(new BigDecimal("60.00"));
        r.setCurrency("UAH");
        r.setPassengerCount(2);
        r.setWaypoints(List.of(wp("A", "50", "14"), wp("B", "51", "15")));
        if (km != null) {
            SaveRouteRequest.Snapshot s = new SaveRouteRequest.Snapshot();
            s.setDistanceKm(new BigDecimal(km));
            s.setQuality(quality);
            r.setSnapshot(s);
        }
        return r;
    }

    private WaypointDTO wp(String name, String lat, String lng) {
        WaypointDTO w = new WaypointDTO();
        w.setName(name);
        w.setLatitude(new BigDecimal(lat));
        w.setLongitude(new BigDecimal(lng));
        return w;
    }
}
