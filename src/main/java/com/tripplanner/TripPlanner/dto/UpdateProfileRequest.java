package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for updating user profile settings
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileRequest {
    private String displayName;
    private String preferredLanguage;
    private Double defaultFuelConsumption;
    private Boolean emailNotificationsEnabled;
}
