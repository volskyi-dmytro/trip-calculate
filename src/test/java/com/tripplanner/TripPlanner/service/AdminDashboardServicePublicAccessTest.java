package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.UserManagementDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.entity.UserRole;
import com.tripplanner.TripPlanner.repository.AccessRequestRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import com.tripplanner.TripPlanner.security.UserSessionTerminator;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
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
                users, routes, featureAccess, requests, usage, cache, mock(UserDashboardService.class),
                mock(UserSessionTerminator.class));
        UserManagementDTO result = service.getAllUsers().get(0);

        assertTrue(result.getRoutePlannerAccess());
        verifyNoInteractions(featureAccess);
    }

    @Test
    void adminDeletionErasesTheSameDataAsSelfDeletion() {
        UserDashboardService userDashboard = mock(UserDashboardService.class);
        AdminDashboardService service = new AdminDashboardService(
                mock(UserRepository.class), mock(RouteRepository.class), mock(FeatureAccessRepository.class),
                mock(AccessRequestRepository.class), mock(AiUsageService.class), mock(AiCacheService.class),
                userDashboard, mock(UserSessionTerminator.class));

        service.deleteUser(7L);

        verify(userDashboard).deleteUserAccount(7L);
    }

    @Test
    void changingARoleEndsThatUsersSessionsSoTheNewRoleAppliesAtOnce() {
        UserRepository users = mock(UserRepository.class);
        UserSessionTerminator sessions = mock(UserSessionTerminator.class);
        User user = new User();
        user.setId(7L);
        user.setGoogleId("google-sub-7");
        user.setRole(UserRole.ADMIN);
        when(users.findById(7L)).thenReturn(Optional.of(user));
        when(users.save(user)).thenReturn(user);
        AdminDashboardService service = new AdminDashboardService(
                users, mock(RouteRepository.class), mock(FeatureAccessRepository.class),
                mock(AccessRequestRepository.class), mock(AiUsageService.class), mock(AiCacheService.class),
                mock(UserDashboardService.class), sessions);

        service.updateUserRole(7L, UserRole.USER);

        verify(sessions).endAllSessions("google-sub-7");
    }
}
