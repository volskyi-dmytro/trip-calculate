package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * DTO for displaying individual AI usage log entries in admin dashboard
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiUsageLogDTO {
    private Long id;
    private Long userId;
    private String userEmail;
    private String ipAddress;
    private String prompt;
    private Integer promptLength;
    private String language;
    private String responseStatus;
    private String errorMessage;
    private LocalDateTime timestamp;
    private Long durationMs;
}
