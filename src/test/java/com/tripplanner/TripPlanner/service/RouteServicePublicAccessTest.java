package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.SaveRouteRequest;
import com.tripplanner.TripPlanner.dto.WaypointDTO;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.WaypointRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RouteServicePublicAccessTest {

    @Test
    void authenticatedUserCanSaveRouteWithoutManualFeatureGrant() {
        RouteRepository routes = mock(RouteRepository.class);
        WaypointRepository waypoints = mock(WaypointRepository.class);
        when(routes.save(any(Route.class))).thenAnswer(invocation -> invocation.getArgument(0));

        RouteService service = new RouteService(routes, waypoints);

        assertDoesNotThrow(() -> service.saveRoute(validRoute(), 42L));
    }

    private SaveRouteRequest validRoute() {
        WaypointDTO kyiv = waypoint("Kyiv", "50.4501", "30.5234");
        WaypointDTO lviv = waypoint("Lviv", "49.8397", "24.0297");
        SaveRouteRequest request = new SaveRouteRequest();
        request.setName("Public beta route");
        request.setFuelConsumption(new BigDecimal("7.0"));
        request.setFuelCostPerLiter(new BigDecimal("60.0"));
        request.setCurrency("UAH");
        request.setPassengerCount(1);
        request.setWaypoints(List.of(kyiv, lviv));
        return request;
    }

    private WaypointDTO waypoint(String name, String latitude, String longitude) {
        WaypointDTO waypoint = new WaypointDTO();
        waypoint.setName(name);
        waypoint.setLatitude(new BigDecimal(latitude));
        waypoint.setLongitude(new BigDecimal(longitude));
        return waypoint;
    }
}
