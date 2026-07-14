package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.UserManagementDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.AccessRequestRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminDashboardServicePublicAccessTest {

    @Test
    void userManagementReportsAutomaticAccessWithoutLegacyGrantLookup() {
        UserRepository users = mock(UserRepository.class);
        RouteRepository routes = mock(RouteRepository.class);
        FeatureAccessRepository featureAccess = mock(FeatureAccessRepository.class);
        AccessRequestRepository requests = mock(AccessRequestRepository.class);
        AiUsageService usage = mock(AiUsageService.class);
        AiCacheService cache = mock(AiCacheService.class);
        User user = new User();
        user.setId(7L);
        user.setEmail("user@example.com");
        when(users.findAllOrderByCreatedAtDesc()).thenReturn(List.of(user));
        when(routes.countByUserId(7L)).thenReturn(0L);

        AdminDashboardService service = new AdminDashboardService(
                users, routes, featureAccess, requests, usage, cache);
        UserManagementDTO result = service.getAllUsers().get(0);

        assertTrue(result.getRoutePlannerAccess());
        verifyNoInteractions(featureAccess);
    }
}
