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
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
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
        when(users.countByRole(UserRole.ADMIN)).thenReturn(2L); // not the last admin
        AdminDashboardService service = new AdminDashboardService(
                users, mock(RouteRepository.class), mock(FeatureAccessRepository.class),
                mock(AccessRequestRepository.class), mock(AiUsageService.class), mock(AiCacheService.class),
                mock(UserDashboardService.class), sessions);

        service.updateUserRole(7L, UserRole.USER);

        verify(sessions).endAllSessions("google-sub-7");
    }

    private static AdminDashboardService serviceWith(UserRepository users, UserSessionTerminator sessions) {
        return new AdminDashboardService(
                users, mock(RouteRepository.class), mock(FeatureAccessRepository.class),
                mock(AccessRequestRepository.class), mock(AiUsageService.class), mock(AiCacheService.class),
                mock(UserDashboardService.class), sessions);
    }

    private static User userWithRole(long id, UserRole role) {
        User user = new User();
        user.setId(id);
        user.setGoogleId("google-sub-" + id);
        user.setRole(role);
        return user;
    }

    @Test
    void savingTheSameRoleAgainDoesNotSignAnyoneOut() {
        UserRepository users = mock(UserRepository.class);
        UserSessionTerminator sessions = mock(UserSessionTerminator.class);
        when(users.findById(7L)).thenReturn(Optional.of(userWithRole(7L, UserRole.USER)));

        serviceWith(users, sessions).updateUserRole(7L, UserRole.USER);

        verify(sessions, never()).endAllSessions(anyString());
        verify(users, never()).save(any());
    }

    @Test
    void theLastAdminCannotBeDemoted() {
        UserRepository users = mock(UserRepository.class);
        UserSessionTerminator sessions = mock(UserSessionTerminator.class);
        when(users.findById(1L)).thenReturn(Optional.of(userWithRole(1L, UserRole.ADMIN)));
        when(users.countByRole(UserRole.ADMIN)).thenReturn(1L);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> serviceWith(users, sessions).updateUserRole(1L, UserRole.USER));

        assertEquals(409, error.getStatusCode().value());
        verify(sessions, never()).endAllSessions(anyString());
    }
}
