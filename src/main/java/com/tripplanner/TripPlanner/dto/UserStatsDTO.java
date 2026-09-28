package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;

/**
 * DTO for user activity statistics
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserStatsDTO {
    private Long totalRoutes;
    private Long totalWaypoints;
    private BigDecimal totalDistance;
    private BigDecimal totalFuelCost;
    private Long accountAgeDays;
    private String mostUsedCurrency;
    /** Fuel cost summed per currency (most used first); totalFuelCost mixes currencies. */
    private Map<String, BigDecimal> fuelCostByCurrency;
}
