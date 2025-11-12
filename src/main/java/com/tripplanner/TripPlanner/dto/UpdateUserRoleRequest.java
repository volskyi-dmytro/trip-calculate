package com.tripplanner.TripPlanner.dto;

import com.tripplanner.TripPlanner.entity.UserRole;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for updating user role
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateUserRoleRequest {
    private UserRole role;
}
