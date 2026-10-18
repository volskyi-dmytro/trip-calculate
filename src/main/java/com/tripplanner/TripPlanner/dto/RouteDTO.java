package com.tripplanner.TripPlanner.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class RouteDTO {
    private Long id;
    private String name;
    private BigDecimal fuelConsumption;
    private BigDecimal fuelCostPerLiter;
    private String currency;
    private Integer passengerCount;
    private BigDecimal totalDistance;
    private BigDecimal totalCost;
    private String fuelType;
    private LocalDate departureDate;
    private Integer totalDurationMinutes;
    /** road | approximate | legacy (legacy = saved with straight-line totals, never recalculated). */
    private String distanceQuality;
    private String distanceSource;
    private String calculationVersion;
    private LocalDateTime calculatedAt;
    private List<WaypointDTO> waypoints;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
