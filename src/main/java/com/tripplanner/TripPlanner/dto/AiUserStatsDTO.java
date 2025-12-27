package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO for displaying top AI users in admin dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiUserStatsDTO {
    private Long userId;
    private String userEmail;
    private Long requestCount;
}
