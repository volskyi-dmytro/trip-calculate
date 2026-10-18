package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.RouteDTO;
import com.tripplanner.TripPlanner.dto.SaveRouteRequest;
import com.tripplanner.TripPlanner.dto.WaypointDTO;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.WaypointRepository;
import com.tripplanner.TripPlanner.routing.RoutingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** P0-B: saved totals come from the server's road route, never from client numbers. */
class RouteServiceProvenanceTest {

    private RouteRepository routes;
    private RoutingService routing;
    private RouteService service;

    @BeforeEach
    void setUp() {
        routes = mock(RouteRepository.class);
        routing = mock(RoutingService.class);
        when(routes.save(any(Route.class))).thenAnswer(i -> i.getArgument(0));
        service = new RouteService(routes, mock(WaypointRepository.class), routing, RouteTestTransactions.manager(), new com.tripplanner.TripPlanner.service.RouteSaveLimiter(4, 1), mock(jakarta.persistence.EntityManagerFactory.class));
    }

    @Test
    void sameUserCannotStartAnotherSaveWhileProviderIsActive() {
        java.util.concurrent.atomic.AtomicBoolean nested = new java.util.concurrent.atomic.AtomicBoolean();
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            if (!nested.getAndSet(true)) {
                assertThatThrownBy(() -> service.saveRoute(request(), 7L))
                    .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, ex -> {
                        assertThat(ex.getStatusCode().value()).isEqualTo(429);
                        assertThat(ex.getReason()).isEqualTo("ROUTE_SAVE_BUSY");
                    });
            }
            return road(540, 300);
        });
        service.saveRoute(request(), 7L);
        verify(routing, times(1)).calculateRoute(any());
    }

    @Test
    void fatalProviderFailureAndPersistenceFailureDoNotLeakAdmission() {
        when(routing.calculateRoute(any())).thenThrow(new AssertionError("fatal provider"));
        assertThatThrownBy(() -> service.saveRoute(request(), 7L)).isInstanceOf(AssertionError.class);
        reset(routing);
        when(routing.calculateRoute(any())).thenReturn(road(540, 300));
        when(routes.save(any(Route.class))).thenThrow(new IllegalStateException("write failed"));
        assertThatThrownBy(() -> service.saveRoute(request(), 7L)).isInstanceOf(IllegalStateException.class);
        doAnswer(i -> i.getArgument(0)).when(routes).save(any(Route.class));
        assertThat(service.saveRoute(request(), 7L).getTotalDistance()).isEqualByComparingTo("540");
    }

    private Map<String, Object> road(double km, double minutes) {
        return Map.of("totalDistance", km, "totalDuration", minutes, "quality", "road", "provider", "mapbox");
    }

    @Test
    void savedTotalsMatchThePlannerRoadRouteAndSettingsRoundTrip() {
        when(routing.calculateRoute(any())).thenReturn(road(540.0, 300));
        SaveRouteRequest request = request();
        request.setFuelType("diesel");
        request.setDepartureDate(LocalDate.of(2026, 7, 1));

        RouteDTO saved = service.saveRoute(request, 7L);

        // planner: 540 km / 100 * 10 L/100km * 60 per L
        assertThat(saved.getTotalDistance()).isEqualByComparingTo("540.00");
        assertThat(saved.getTotalCost()).isEqualByComparingTo("3240.00");
        assertThat(saved.getTotalDurationMinutes()).isEqualTo(300);
        assertThat(saved.getDistanceQuality()).isEqualTo("road");
        assertThat(saved.getDistanceSource()).isEqualTo("mapbox");
        assertThat(saved.getCalculationVersion()).isEqualTo(RouteService.CALCULATION_VERSION);
        assertThat(saved.getFuelType()).isEqualTo("diesel");
        assertThat(saved.getDepartureDate()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(saved.getWaypoints()).hasSize(2);
    }

    @Test
    void outageIsStoredAsApproximateStraightLine() {
        when(routing.calculateRoute(any())).thenReturn(Map.of("totalDistance", 0, "quality", "approximate"));

        RouteDTO saved = service.saveRoute(request(), 7L);

        assertThat(saved.getDistanceQuality()).isEqualTo("approximate");
        assertThat(saved.getDistanceSource()).isEqualTo("straight-line");
        assertThat(saved.getTotalDurationMinutes()).isNull();
        assertThat(saved.getTotalDistance()).isBetween(new BigDecimal("400"), new BigDecimal("500"));
    }

    @Test
    void providerExceptionAlsoDegradesToApproximate() {
        when(routing.calculateRoute(any())).thenThrow(new IllegalStateException("boom"));
        assertThat(service.saveRoute(request(), 7L).getDistanceQuality()).isEqualTo("approximate");
    }

    @Test
    void noRouteCannotBeSaved() {
        when(routing.calculateRoute(any())).thenReturn(Map.of("noRoute", true, "quality", "unavailable"));
        assertThatThrownBy(() -> service.saveRoute(request(), 7L)).isInstanceOf(IllegalArgumentException.class);
        verify(routes, never()).save(any());
    }

    @Test
    void tamperedSnapshotIsRejected() {
        when(routing.calculateRoute(any())).thenReturn(road(540.0, 300));

        assertThatThrownBy(() -> service.saveRoute(withSnapshot("100.00", "road"), 7L))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> service.saveRoute(withSnapshot("540.00", "approximate"), 7L))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verify(routes, never()).save(any());

        // Snapshots in the same decimal normalization bucket are accepted.
        assertThat(service.saveRoute(withSnapshot("540.004", "road"), 7L).getTotalDistance()).isEqualByComparingTo("540.00");
    }

    @Test
    void fiveKmDriftIsAnExactConflictWithoutRetryOrSave() {
        when(routing.calculateRoute(any())).thenReturn(road(545, 300));
        assertThatThrownBy(() -> service.saveRoute(withSnapshot("540", "road"), 7L))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode().value()).isEqualTo(409);
                    assertThat(ex.getReason()).isEqualTo("ROUTE_SNAPSHOT_STALE");
                });
        verify(routing, times(1)).calculateRoute(any());
        verify(routes, never()).save(any());
    }

    @Test
    void clientCannotUpdateAnotherUsersRoute() {
        when(routes.findByIdAndUserId(5L, 99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateRoute(5L, request(), 99L)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.getRoute(5L, 99L)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.deleteRoute(5L, 99L)).isInstanceOf(RuntimeException.class);
        verify(routes, never()).save(any());
        verifyNoInteractions(routing);
    }

    @Test
    void updateRecomputesAndOverwritesOldLegacyProvenance() {
        Route legacy = new Route();
        legacy.setUserId(7L);
        legacy.setTotalDistance(new BigDecimal("430.00"));
        when(routes.findByIdAndUserId(5L, 7L)).thenReturn(Optional.of(legacy));
        when(routes.findRootForUpdate(5L)).thenReturn(Optional.of(legacy));
        when(routing.calculateRoute(any())).thenReturn(road(560.0, 330));

        RouteDTO updated = service.updateRoute(5L, request(), 7L);

        assertThat(updated.getDistanceQuality()).isEqualTo("road"); // only an explicit user save upgrades it
        assertThat(updated.getTotalDistance()).isEqualByComparingTo("560.00");
    }

    @Test
    void legacyRecordsStayReadableAndAreNotSilentlyUpgraded() {
        Route legacy = new Route();
        legacy.setId(3L);
        legacy.setUserId(7L);
        legacy.setName("Old");
        legacy.setTotalDistance(new BigDecimal("430.00"));
        legacy.setTotalCost(new BigDecimal("2580.00"));
        when(routes.findByIdAndUserId(3L, 7L)).thenReturn(Optional.of(legacy));

        RouteDTO dto = service.getRoute(3L, 7L);

        assertThat(dto.getDistanceQuality()).isEqualTo("legacy");
        assertThat(dto.getTotalDistance()).isEqualByComparingTo("430.00");
        assertThat(dto.getCalculationVersion()).isNull();
        verifyNoInteractions(routing);
        verify(routes, never()).save(any());
    }

    private SaveRouteRequest withSnapshot(String km, String quality) {
        SaveRouteRequest r = request();
        SaveRouteRequest.Snapshot s = new SaveRouteRequest.Snapshot();
        s.setDistanceKm(new BigDecimal(km));
        s.setQuality(quality);
        r.setSnapshot(s);
        return r;
    }

    private SaveRouteRequest request() {
        SaveRouteRequest r = new SaveRouteRequest();
        r.setName("Kyiv - Lviv");
        r.setFuelConsumption(new BigDecimal("10.0"));
        r.setFuelCostPerLiter(new BigDecimal("60.00"));
        r.setCurrency("UAH");
        r.setPassengerCount(2);
        r.setWaypoints(List.of(wp("Kyiv", "50.4501", "30.5234"), wp("Lviv", "49.8397", "24.0297")));
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
