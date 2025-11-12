package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * System-wide statistics for admin dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminStatsDTO {
    private Long totalUsers;
    private Long activeUsers; // logged in within last 7 days
    private Long newUsersLast24h;
    private Long newUsersLast7d;
    private Long newUsersLast30d;
    private Long totalRoutes;
    private Long totalWaypoints;
    private Long pendingAccessRequests;
    private Long usersWithRoutePlanner;
}
