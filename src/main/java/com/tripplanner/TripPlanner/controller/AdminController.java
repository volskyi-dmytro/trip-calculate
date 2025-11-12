package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.entity.UserRole;
import com.tripplanner.TripPlanner.service.AdminDashboardService;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for admin dashboard and user management
 * All endpoints require ADMIN role
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminDashboardService adminService;
    private final UserService userService;

    /**
     * Get system-wide statistics
     */
    @GetMapping("/stats")
    public ResponseEntity<AdminStatsDTO> getSystemStats() {
        AdminStatsDTO stats = adminService.getSystemStats();
        return ResponseEntity.ok(stats);
    }

    /**
     * Get all users
     */
    @GetMapping("/users")
    public ResponseEntity<List<UserManagementDTO>> getAllUsers() {
        List<UserManagementDTO> users = adminService.getAllUsers();
        return ResponseEntity.ok(users);
    }

    /**
     * Get user details by ID
     */
    @GetMapping("/users/{userId}")
    public ResponseEntity<UserManagementDTO> getUserDetails(@PathVariable Long userId) {
        UserManagementDTO user = adminService.getUserDetails(userId);
        return ResponseEntity.ok(user);
    }

    /**
     * Update user role
     */
    @PutMapping("/users/{userId}/role")
    public ResponseEntity<UserManagementDTO> updateUserRole(
            @PathVariable Long userId,
            @RequestBody UpdateUserRoleRequest request) {
        UserManagementDTO user = adminService.updateUserRole(userId, request.getRole());
        return ResponseEntity.ok(user);
    }

    /**
     * Grant route planner access to a user
     */
    @PostMapping("/users/{userId}/grant-access")
    public ResponseEntity<Map<String, String>> grantAccess(
            @PathVariable Long userId,
            @AuthenticationPrincipal OAuth2User principal) {
        String adminEmail = getAdminEmail(principal);
        adminService.updateRoutePlannerAccess(userId, true, adminEmail);
        return ResponseEntity.ok(Map.of("message", "Access granted successfully"));
    }

    /**
     * Revoke route planner access from a user
     */
    @PostMapping("/users/{userId}/revoke-access")
    public ResponseEntity<Map<String, String>> revokeAccess(
            @PathVariable Long userId,
            @AuthenticationPrincipal OAuth2User principal) {
        String adminEmail = getAdminEmail(principal);
        adminService.updateRoutePlannerAccess(userId, false, adminEmail);
        return ResponseEntity.ok(Map.of("message", "Access revoked successfully"));
    }

    /**
     * Delete user (admin action)
     */
    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long userId) {
        adminService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Get all access requests
     */
    @GetMapping("/access-requests")
    public ResponseEntity<List<AccessRequestDTO>> getAllAccessRequests() {
        List<AccessRequestDTO> requests = adminService.getAllAccessRequests();
        return ResponseEntity.ok(requests);
    }

    /**
     * Get pending access requests
     */
    @GetMapping("/access-requests/pending")
    public ResponseEntity<List<AccessRequestDTO>> getPendingAccessRequests() {
        List<AccessRequestDTO> requests = adminService.getPendingAccessRequests();
        return ResponseEntity.ok(requests);
    }

    /**
     * Approve access request
     */
    @PostMapping("/access-requests/{requestId}/approve")
    public ResponseEntity<AccessRequestDTO> approveAccessRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal OAuth2User principal) {
        String adminEmail = getAdminEmail(principal);
        AccessRequestDTO request = adminService.approveAccessRequest(requestId, adminEmail);
        return ResponseEntity.ok(request);
    }

    /**
     * Deny access request
     */
    @PostMapping("/access-requests/{requestId}/deny")
    public ResponseEntity<AccessRequestDTO> denyAccessRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal OAuth2User principal) {
        String adminEmail = getAdminEmail(principal);
        AccessRequestDTO request = adminService.denyAccessRequest(requestId, adminEmail);
        return ResponseEntity.ok(request);
    }

    /**
     * Helper method to get admin email from OAuth2 principal
     */
    private String getAdminEmail(OAuth2User principal) {
        if (principal == null) {
            throw new RuntimeException("User not authenticated");
        }

        String googleId = principal.getAttribute("sub");
        User user = userService.findByGoogleId(googleId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!user.isAdmin()) {
            throw new RuntimeException("User is not an admin");
        }

        return user.getEmail();
    }
}
