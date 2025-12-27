package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * DTO for displaying daily AI request counts in admin dashboard charts
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiDailyStatsDTO {
    private LocalDate date;
    private Long requestCount;
}
