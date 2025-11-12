package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Simplified route information for list display
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteListItemDTO {
    private Long id;
    private String name;
    private Integer waypointCount;
    private BigDecimal totalDistance;
    private BigDecimal totalCost;
    private String currency;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
