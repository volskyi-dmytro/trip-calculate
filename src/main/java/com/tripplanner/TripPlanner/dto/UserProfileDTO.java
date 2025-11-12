package com.tripplanner.TripPlanner.dto;

import com.tripplanner.TripPlanner.entity.UserRole;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO for user profile information displayed in dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserProfileDTO {
    private Long id;
    private String email;
    private String name;
    private String displayName;
    private String pictureUrl;
    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
    private UserRole role;
    private String preferredLanguage;
    private Double defaultFuelConsumption;
    private Boolean emailNotificationsEnabled;
    private Boolean routePlannerAccess;
}
