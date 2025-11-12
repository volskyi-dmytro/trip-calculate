package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Complete user dashboard data including profile, stats, and routes
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDashboardDTO {
    private UserProfileDTO profile;
    private UserStatsDTO stats;
    private List<RouteListItemDTO> recentRoutes;
}
