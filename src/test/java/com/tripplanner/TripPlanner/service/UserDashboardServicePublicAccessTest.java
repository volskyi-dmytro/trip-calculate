package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.UserProfileDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.CarRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserDashboardServicePublicAccessTest {

    @Test
    void profileReportsRoutePlannerAccessForAuthenticatedUserWithoutLegacyGrant() {
        UserRepository users = mock(UserRepository.class);
        RouteRepository routes = mock(RouteRepository.class);
        FeatureAccessRepository featureAccess = mock(FeatureAccessRepository.class);
        User user = new User();
        user.setId(42L);
        user.setEmail("user@example.com");
        user.setName("User");
        when(users.findById(42L)).thenReturn(Optional.of(user));
        when(featureAccess.findByUserId(42L)).thenReturn(Optional.empty());

        UserProfileDTO profile = new UserDashboardService(users, routes, featureAccess, mock(CarRepository.class))
                .getUserProfile(42L);

        assertTrue(profile.getRoutePlannerAccess());
    }

    @Test
    void deletingTheAccountDeletesTheUsersCarsExplicitly() {
        // Car.userId is a plain column: without an explicit delete, cars
        // survive in any database where the V6 cascade was never applied.
        UserRepository users = mock(UserRepository.class);
        CarRepository cars = mock(CarRepository.class);
        UserDashboardService service = new UserDashboardService(
                users, mock(RouteRepository.class), mock(FeatureAccessRepository.class), cars);

        service.deleteUserAccount(42L);

        verify(cars).deleteByUserId(42L);
        verify(users).deleteById(42L);
    }
}
