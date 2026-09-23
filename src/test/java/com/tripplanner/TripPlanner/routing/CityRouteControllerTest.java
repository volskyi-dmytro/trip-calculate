package com.tripplanner.TripPlanner.routing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CityRouteControllerTest {

    private CityRouteController controller;

    @BeforeEach
    void setUp() {
        RoutingService routingService = mock(RoutingService.class);
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 0, "totalDuration", 0, "geometry", List.of(), "segments", List.of()));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());
        controller = new CityRouteController(new CityRouteService(routingService, jdbc));
    }

    @Test
    void listReturnsAllCatalogSlugs() {
        List<Map<String, Object>> list = controller.list();
        assertEquals(CityRouteCatalog.ALL.size(), list.size());
        assertEquals("kyiv-lviv", list.get(0).get("slug"));
    }

    @Test
    void knownSlugReturns200() {
        ResponseEntity<Map<String, Object>> response = controller.get("kyiv-lviv", "uk");
        assertEquals(200, response.getStatusCode().value());
        assertEquals("Київ", response.getBody().get("fromName"));
    }

    @Test
    void unknownSlugReturns404() {
        ResponseEntity<Map<String, Object>> response = controller.get("does-not-exist", "uk");
        assertEquals(404, response.getStatusCode().value());
        assertFalse(response.hasBody());
    }
}
