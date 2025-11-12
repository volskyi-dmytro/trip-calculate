package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.FeatureAccess;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for user dashboard operations
 */
@Service
@RequiredArgsConstructor
public class UserDashboardService {

    private final UserRepository userRepository;
    private final RouteRepository routeRepository;
    private final FeatureAccessRepository featureAccessRepository;

    /**
     * Get complete dashboard data for a user
     */
    @Transactional(readOnly = true)
    public UserDashboardDTO getDashboardData(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        UserProfileDTO profile = buildUserProfile(user);
        UserStatsDTO stats = buildUserStats(user);
        List<RouteListItemDTO> recentRoutes = getRecentRoutes(userId, 10);

        return UserDashboardDTO.builder()
                .profile(profile)
                .stats(stats)
                .recentRoutes(recentRoutes)
                .build();
    }

    /**
     * Get user profile information
     */
    @Transactional(readOnly = true)
    public UserProfileDTO getUserProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return buildUserProfile(user);
    }

    /**
     * Get user statistics
     */
    @Transactional(readOnly = true)
    public UserStatsDTO getUserStats(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return buildUserStats(user);
    }

    /**
     * Get user's routes with pagination
     */
    @Transactional(readOnly = true)
    public List<RouteListItemDTO> getUserRoutes(Long userId, int limit) {
        return getRecentRoutes(userId, limit);
    }

    /**
     * Update user profile
     */
    @Transactional
    public UserProfileDTO updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (request.getDisplayName() != null) {
            user.setDisplayName(request.getDisplayName());
        }
        if (request.getPreferredLanguage() != null) {
            user.setPreferredLanguage(request.getPreferredLanguage());
        }
        if (request.getDefaultFuelConsumption() != null) {
            user.setDefaultFuelConsumption(request.getDefaultFuelConsumption());
        }
        if (request.getEmailNotificationsEnabled() != null) {
            user.setEmailNotificationsEnabled(request.getEmailNotificationsEnabled());
        }

        user = userRepository.save(user);
        return buildUserProfile(user);
    }

    /**
     * Delete user account and all associated data
     */
    @Transactional
    public void deleteUserAccount(Long userId) {
        // Delete all user's routes (cascade will delete waypoints)
        List<Route> routes = routeRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        routeRepository.deleteAll(routes);

        // Delete feature access
        featureAccessRepository.findByUserId(userId).ifPresent(featureAccessRepository::delete);

        // Delete user
        userRepository.deleteById(userId);
    }

    // Helper methods

    private UserProfileDTO buildUserProfile(User user) {
        FeatureAccess featureAccess = featureAccessRepository.findByUserId(user.getId())
                .orElse(null);

        return UserProfileDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .displayName(user.getDisplayName())
                .pictureUrl(user.getPictureUrl())
                .createdAt(user.getCreatedAt())
                .lastLogin(user.getLastLogin())
                .role(user.getRole())
                .preferredLanguage(user.getPreferredLanguage())
                .defaultFuelConsumption(user.getDefaultFuelConsumption())
                .emailNotificationsEnabled(user.getEmailNotificationsEnabled())
                .routePlannerAccess(featureAccess != null && featureAccess.getRoutePlannerEnabled())
                .build();
    }

    private UserStatsDTO buildUserStats(User user) {
        Long totalRoutes = routeRepository.countByUserId(user.getId());
        Long totalWaypoints = routeRepository.countTotalWaypointsByUserId(user.getId());
        BigDecimal totalDistance = routeRepository.sumTotalDistanceByUserId(user.getId());
        BigDecimal totalFuelCost = routeRepository.sumTotalCostByUserId(user.getId());

        // Calculate account age in days
        long accountAgeDays = ChronoUnit.DAYS.between(user.getCreatedAt(), LocalDateTime.now());

        // Get most used currency
        List<Object[]> currencyStats = routeRepository.findMostUsedCurrencyByUserId(user.getId());
        String mostUsedCurrency = currencyStats.isEmpty() ? null : (String) currencyStats.get(0)[0];

        return UserStatsDTO.builder()
                .totalRoutes(totalRoutes)
                .totalWaypoints(totalWaypoints != null ? totalWaypoints : 0L)
                .totalDistance(totalDistance != null ? totalDistance : BigDecimal.ZERO)
                .totalFuelCost(totalFuelCost != null ? totalFuelCost : BigDecimal.ZERO)
                .accountAgeDays(accountAgeDays)
                .mostUsedCurrency(mostUsedCurrency)
                .build();
    }

    private List<RouteListItemDTO> getRecentRoutes(Long userId, int limit) {
        List<Route> routes = routeRepository.findByUserIdOrderByUpdatedAtDesc(
                userId,
                PageRequest.of(0, limit)
        );

        return routes.stream()
                .map(this::convertToRouteListItem)
                .collect(Collectors.toList());
    }

    private RouteListItemDTO convertToRouteListItem(Route route) {
        return RouteListItemDTO.builder()
                .id(route.getId())
                .name(route.getName())
                .waypointCount(route.getWaypoints() != null ? route.getWaypoints().size() : 0)
                .totalDistance(route.getTotalDistance())
                .totalCost(route.getTotalCost())
                .currency(route.getCurrency())
                .createdAt(route.getCreatedAt())
                .updatedAt(route.getUpdatedAt())
                .build();
    }
}
