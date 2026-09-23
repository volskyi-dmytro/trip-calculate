package com.tripplanner.TripPlanner.routing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CityRouteServiceTest {

    private RoutingService routingService;
    private JdbcTemplate jdbc;
    private CityRouteService service;

    @BeforeEach
    void setUp() {
        routingService = mock(RoutingService.class);
        jdbc = mock(JdbcTemplate.class);
        service = new CityRouteService(routingService, jdbc);
    }

    @Test
    void unknownSlugIsEmpty() {
        assertEquals(Optional.empty(), service.get("does-not-exist", "uk"));
    }

    @Test
    void fallsBackToCatalogEstimateWhenRoutingThrows() {
        when(routingService.calculateRoute(anyList())).thenThrow(new RuntimeException("mapbox down"));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertEquals("estimate", result.get("distanceSource"));
        assertEquals(540.0, (double) result.get("distanceKm"));
    }

    @Test
    void fallsBackToCatalogEstimateWhenRoutingReturnsZeroDistance() {
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 0, "totalDuration", 0, "geometry", List.of(), "segments", List.of()));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertEquals("estimate", result.get("distanceSource"));
    }

    @Test
    void usesLiveDistanceWhenRoutingSucceeds() {
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 545.5, "totalDuration", 390.0, "geometry", List.of(), "segments", List.of()));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertEquals("live", result.get("distanceSource"));
        assertEquals(545.5, (double) result.get("distanceKm"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void fuelLookupFailureDegradesToNullPriceInsteadOfThrowing() {
        when(routingService.calculateRoute(anyList())).thenThrow(new RuntimeException("providers down"));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class)))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("db down"));

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertNull(result.get("totalCost"));
        assertEquals("estimate", result.get("distanceSource"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void failedRoutingIsCachedSoProvidersAreNotRetriedPerRequest() {
        when(routingService.calculateRoute(anyList())).thenThrow(new RuntimeException("providers down"));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        service.get("kyiv-lviv", "uk");
        service.get("kyiv-lviv", "en");

        org.mockito.Mockito.verify(routingService, org.mockito.Mockito.times(1)).calculateRoute(anyList());
    }

    @Test
    @SuppressWarnings("unchecked")
    void nullPriceFieldsWhenNoFuelRowExists() {
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 0, "totalDuration", 0, "geometry", List.of(), "segments", List.of()));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertNull(result.get("fuelPricePerLiter"));
        assertNull(result.get("totalCost"));
        assertNull(result.get("perPassenger"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void computesCostWhenFuelRowExists() throws Exception {
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 0, "totalDuration", 0, "geometry", List.of(), "segments", List.of()));

        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("currency")).thenReturn("UAH");
        when(rs.getDouble("price")).thenReturn(58.90);
        when(rs.getTimestamp("fetched_at")).thenReturn(Timestamp.from(Instant.now()));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenAnswer(inv -> {
            RowMapper<Object> mapper = inv.getArgument(1);
            return List.of(mapper.mapRow(rs, 0));
        });

        Map<String, Object> result = service.get("kyiv-lviv", "uk").orElseThrow();

        assertEquals(58.9, (double) result.get("fuelPricePerLiter"));
        assertTrue((double) result.get("totalCost") > 0);
        double total = (double) result.get("totalCost");
        double perPassenger = (double) result.get("perPassenger");
        assertEquals(Math.round(total / 4.0 * 100) / 100.0, perPassenger, 0.01);
    }

    @Test
    void relatedRoutesShareACityAndExcludeSelf() {
        Map<String, Object> result = service.get("kyiv-lviv", "en").orElseThrow();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> related = (List<Map<String, Object>>) result.get("related");
        assertFalse(related.isEmpty());
        assertTrue(related.stream().noneMatch(r -> "kyiv-lviv".equals(r.get("slug"))));
    }
}
