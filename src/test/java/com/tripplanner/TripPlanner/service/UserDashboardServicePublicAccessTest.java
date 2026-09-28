package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.UserProfileDTO;
import com.tripplanner.TripPlanner.dto.UserStatsDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.CarRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import com.tripplanner.TripPlanner.security.UserSessionTerminator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

    @Test
    void statsReportFuelCostPerCurrencyInsteadOfOnlyAMixedSum() {
        UserRepository users = mock(UserRepository.class);
        RouteRepository routes = mock(RouteRepository.class);
        User user = new User();
        user.setId(42L);
        user.setCreatedAt(LocalDateTime.now().minusDays(3));
        when(users.findById(42L)).thenReturn(Optional.of(user));
        when(routes.findMostUsedCurrencyByUserId(42L)).thenReturn(List.of(
                new Object[]{"UAH", 2L, new BigDecimal("812.45")},
                new Object[]{null, 1L, new BigDecimal("5.00")},
                new Object[]{"EUR", 1L, new BigDecimal("70.00")}));

        UserStatsDTO stats = new UserDashboardService(users, routes, mock(FeatureAccessRepository.class),
                mock(CarRepository.class), mock(TripReceiptRepository.class),
                mock(AiUsageLogRepository.class), mock(UserSessionTerminator.class))
                .getUserStats(42L);

        assertEquals("UAH", stats.getMostUsedCurrency());
        // Most used first; a route without a currency can't be attributed, so it's left out.
        assertEquals(List.of("UAH", "EUR"), List.copyOf(stats.getFuelCostByCurrency().keySet()));
        assertEquals(new BigDecimal("70.00"), stats.getFuelCostByCurrency().get("EUR"));
    }
}
