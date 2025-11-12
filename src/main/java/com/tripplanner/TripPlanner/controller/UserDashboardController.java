package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserDashboardService;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for user dashboard operations
 */
@RestController
@RequestMapping("/api/user/dashboard")
@RequiredArgsConstructor
public class UserDashboardController {

    private final UserDashboardService dashboardService;
    private final UserService userService;

    /**
     * Get complete dashboard data for authenticated user
     */
    @GetMapping
    public ResponseEntity<UserDashboardDTO> getDashboard(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserIdFromPrincipal(principal);
        UserDashboardDTO dashboard = dashboardService.getDashboardData(userId);
        return ResponseEntity.ok(dashboard);
    }

    /**
     * Get user profile
     */
    @GetMapping("/profile")
    public ResponseEntity<UserProfileDTO> getProfile(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserIdFromPrincipal(principal);
        UserProfileDTO profile = dashboardService.getUserProfile(userId);
        return ResponseEntity.ok(profile);
    }

    /**
     * Update user profile
     */
    @PutMapping("/profile")
    public ResponseEntity<UserProfileDTO> updateProfile(
            @AuthenticationPrincipal OAuth2User principal,
            @RequestBody UpdateProfileRequest request) {
        Long userId = getUserIdFromPrincipal(principal);
        UserProfileDTO profile = dashboardService.updateUserProfile(userId, request);
        return ResponseEntity.ok(profile);
    }

    /**
     * Get user statistics
     */
    @GetMapping("/stats")
    public ResponseEntity<UserStatsDTO> getStats(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserIdFromPrincipal(principal);
        UserStatsDTO stats = dashboardService.getUserStats(userId);
        return ResponseEntity.ok(stats);
    }

    /**
     * Get user's routes
     */
    @GetMapping("/routes")
    public ResponseEntity<List<RouteListItemDTO>> getRoutes(
            @AuthenticationPrincipal OAuth2User principal,
            @RequestParam(defaultValue = "20") int limit) {
        Long userId = getUserIdFromPrincipal(principal);
        List<RouteListItemDTO> routes = dashboardService.getUserRoutes(userId, limit);
        return ResponseEntity.ok(routes);
    }

    /**
     * Delete user account
     */
    @DeleteMapping("/account")
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserIdFromPrincipal(principal);
        dashboardService.deleteUserAccount(userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Helper method to extract user ID from OAuth2 principal
     */
    private Long getUserIdFromPrincipal(OAuth2User principal) {
        if (principal == null) {
            throw new RuntimeException("User not authenticated");
        }

        String googleId = principal.getAttribute("sub");
        User user = userService.findByGoogleId(googleId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return user.getId();
    }
}
