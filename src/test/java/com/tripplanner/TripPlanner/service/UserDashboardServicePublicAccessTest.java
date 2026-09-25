package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.UserProfileDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.CarRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import com.tripplanner.TripPlanner.security.UserSessionTerminator;
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

        UserProfileDTO profile = new UserDashboardService(users, routes, featureAccess, mock(CarRepository.class),
                mock(TripReceiptRepository.class), mock(AiUsageLogRepository.class),
                mock(UserSessionTerminator.class))
                .getUserProfile(42L);

        assertTrue(profile.getRoutePlannerAccess());
    }

    @Test
    void deletingTheAccountErasesEverythingTiedToTheUser() {
        // These tables hold user_id as a plain column (no JPA relation), so
        // each one is deleted explicitly rather than trusting DB cascades.
        UserRepository users = mock(UserRepository.class);
        CarRepository cars = mock(CarRepository.class);
        TripReceiptRepository receipts = mock(TripReceiptRepository.class);
        AiUsageLogRepository aiUsage = mock(AiUsageLogRepository.class);
        UserSessionTerminator sessions = mock(UserSessionTerminator.class);
        User user = new User();
        user.setId(42L);
        user.setGoogleId("google-sub-42");
        when(users.findById(42L)).thenReturn(Optional.of(user));
        UserDashboardService service = new UserDashboardService(
                users, mock(RouteRepository.class), mock(FeatureAccessRepository.class),
                cars, receipts, aiUsage, sessions);

        service.deleteUserAccount(42L);

        // Every device is signed out, not only the one that asked for deletion.
        verify(sessions).endAllSessions("google-sub-42");

        verify(cars).deleteByUserId(42L);
        verify(receipts).deleteByUserId(42L);
        verify(aiUsage).deleteByUserId(42L);
        verify(users).deleteById(42L);
    }
}
