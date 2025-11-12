package com.tripplanner.TripPlanner.dto;

import com.tripplanner.TripPlanner.entity.UserRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * User information for admin user management table
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserManagementDTO {
    private Long id;
    private String email;
    private String name;
    private String displayName;
    private UserRole role;
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
    private Boolean routePlannerAccess;
    private Long routeCount;
}
