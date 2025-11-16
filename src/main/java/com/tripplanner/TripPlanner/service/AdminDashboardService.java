package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.AccessRequest;
import com.tripplanner.TripPlanner.entity.FeatureAccess;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.entity.UserRole;
import com.tripplanner.TripPlanner.repository.AccessRequestRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for admin dashboard operations
 */
@Service
@RequiredArgsConstructor
public class AdminDashboardService {

    private final UserRepository userRepository;
    private final RouteRepository routeRepository;
    private final FeatureAccessRepository featureAccessRepository;
    private final AccessRequestRepository accessRequestRepository;
    private final AccessRequestService accessRequestService;

    /**
     * Get system-wide statistics for admin dashboard
     */
    @Transactional(readOnly = true)
    public AdminStatsDTO getSystemStats() {
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByLastLoginAfter(LocalDateTime.now().minusDays(7));
        long newUsersLast24h = userRepository.countByCreatedAtAfter(LocalDateTime.now().minusDays(1));
        long newUsersLast7d = userRepository.countByCreatedAtAfter(LocalDateTime.now().minusDays(7));
        long newUsersLast30d = userRepository.countByCreatedAtAfter(LocalDateTime.now().minusDays(30));
        long totalRoutes = routeRepository.count();
        long totalWaypoints = routeRepository.findAll().stream()
                .mapToLong(r -> r.getWaypoints() != null ? r.getWaypoints().size() : 0)
                .sum();
        long pendingAccessRequests = accessRequestRepository.findByStatusOrderByRequestedAtDesc(
                AccessRequest.RequestStatus.PENDING
        ).size();
        long usersWithRoutePlanner = featureAccessRepository.countByRoutePlannerEnabled(true);

        return AdminStatsDTO.builder()
                .totalUsers(totalUsers)
                .activeUsers(activeUsers)
                .newUsersLast24h(newUsersLast24h)
                .newUsersLast7d(newUsersLast7d)
                .newUsersLast30d(newUsersLast30d)
                .totalRoutes(totalRoutes)
                .totalWaypoints(totalWaypoints)
                .pendingAccessRequests(pendingAccessRequests)
                .usersWithRoutePlanner(usersWithRoutePlanner)
                .build();
    }

    /**
     * Get all users for admin user management
     */
    @Transactional(readOnly = true)
    public List<UserManagementDTO> getAllUsers() {
        List<User> users = userRepository.findAllOrderByCreatedAtDesc();

        return users.stream()
                .map(this::convertToUserManagementDTO)
                .collect(Collectors.toList());
    }

    /**
     * Get user details by ID
     */
    @Transactional(readOnly = true)
    public UserManagementDTO getUserDetails(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return convertToUserManagementDTO(user);
    }

    /**
     * Update user role
     */
    @Transactional
    public UserManagementDTO updateUserRole(Long userId, UserRole newRole) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setRole(newRole);
        user = userRepository.save(user);

        return convertToUserManagementDTO(user);
    }

    /**
     * Grant or revoke route planner access for a user
     */
    @Transactional
    public void updateRoutePlannerAccess(Long userId, boolean granted, String grantedBy) {
        FeatureAccess featureAccess = featureAccessRepository.findByUserId(userId)
                .orElse(new FeatureAccess(null, userId, false, null, null, null));

        featureAccess.setRoutePlannerEnabled(granted);
        if (granted) {
            featureAccess.setGrantedAt(LocalDateTime.now());
            featureAccess.setGrantedBy(grantedBy);

            // Auto-approve any pending access requests for this user and feature
            List<AccessRequest> pendingRequests = accessRequestRepository
                .findByUserIdAndFeatureNameAndStatus(userId, "route_planner", AccessRequest.RequestStatus.PENDING);

            for (AccessRequest request : pendingRequests) {
                request.setStatus(AccessRequest.RequestStatus.APPROVED);
                request.setProcessedAt(LocalDateTime.now());
                request.setProcessedBy(grantedBy + " (auto-approved)");
                accessRequestRepository.save(request);
            }
        } else {
            featureAccess.setGrantedAt(null);
            featureAccess.setGrantedBy(null);
        }

        featureAccessRepository.save(featureAccess);
    }

    /**
     * Get all access requests
     */
    @Transactional(readOnly = true)
    public List<AccessRequestDTO> getAllAccessRequests() {
        List<AccessRequest> requests = accessRequestRepository.findAll();
        return requests.stream()
                .map(this::convertToAccessRequestDTO)
                .collect(Collectors.toList());
    }

    /**
     * Get pending access requests
     */
    @Transactional(readOnly = true)
    public List<AccessRequestDTO> getPendingAccessRequests() {
        List<AccessRequest> requests = accessRequestRepository.findByStatusOrderByRequestedAtDesc(
                AccessRequest.RequestStatus.PENDING
        );
        return requests.stream()
                .map(this::convertToAccessRequestDTO)
                .collect(Collectors.toList());
    }

    /**
     * Approve access request
     */
    @Transactional
    public AccessRequestDTO approveAccessRequest(Long requestId, String approvedBy) {
        AccessRequest request = accessRequestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Access request not found"));

        request.setStatus(AccessRequest.RequestStatus.APPROVED);
        request.setProcessedAt(LocalDateTime.now());
        request.setProcessedBy(approvedBy);
        request = accessRequestRepository.save(request);

        // Grant access to the feature
        updateRoutePlannerAccess(request.getUserId(), true, approvedBy);

        // Send approval email to user
        accessRequestService.sendApprovalEmail(
            request.getUserName(),
            request.getUserEmail(),
            request.getFeatureName()
        );

        return convertToAccessRequestDTO(request);
    }

    /**
     * Deny access request
     */
    @Transactional
    public AccessRequestDTO denyAccessRequest(Long requestId, String deniedBy) {
        AccessRequest request = accessRequestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Access request not found"));

        request.setStatus(AccessRequest.RequestStatus.REJECTED);
        request.setProcessedAt(LocalDateTime.now());
        request.setProcessedBy(deniedBy);
        request = accessRequestRepository.save(request);

        // Send rejection email to user
        accessRequestService.sendRejectionEmail(
            request.getUserName(),
            request.getUserEmail(),
            request.getFeatureName()
        );

        return convertToAccessRequestDTO(request);
    }

    /**
     * Delete user (admin action)
     */
    @Transactional
    public void deleteUser(Long userId) {
        // Delete all user's routes
        List<Route> routes = routeRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        routeRepository.deleteAll(routes);

        // Delete feature access
        featureAccessRepository.findByUserId(userId).ifPresent(featureAccessRepository::delete);

        // Delete user
        userRepository.deleteById(userId);
    }

    // Helper methods

    private UserManagementDTO convertToUserManagementDTO(User user) {
        FeatureAccess featureAccess = featureAccessRepository.findByUserId(user.getId())
                .orElse(null);
        long routeCount = routeRepository.countByUserId(user.getId());

        return UserManagementDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .createdAt(user.getCreatedAt())
                .lastLogin(user.getLastLogin())
                .routePlannerAccess(featureAccess != null && featureAccess.getRoutePlannerEnabled())
                .routeCount(routeCount)
                .build();
    }

    private AccessRequestDTO convertToAccessRequestDTO(AccessRequest request) {
        return AccessRequestDTO.builder()
                .id(request.getId())
                .userId(request.getUserId())
                .userEmail(request.getUserEmail())
                .userName(request.getUserName())
                .featureName(request.getFeatureName())
                .status(request.getStatus())
                .requestedAt(request.getRequestedAt())
                .processedAt(request.getProcessedAt())
                .processedBy(request.getProcessedBy())
                .build();
    }
}
