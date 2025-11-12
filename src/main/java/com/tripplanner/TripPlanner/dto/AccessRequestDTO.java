package com.tripplanner.TripPlanner.dto;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO for access request information
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AccessRequestDTO {
    private Long id;
    private Long userId;
    private String userEmail;
    private String userName;
    private String featureName;
    private AccessRequest.RequestStatus status;
    private LocalDateTime requestedAt;
    private LocalDateTime processedAt;
    private String processedBy;
}
