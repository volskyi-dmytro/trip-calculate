package com.tripplanner.TripPlanner.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class RouteDTO {
    private Long id;
    private String name;
    private BigDecimal fuelConsumption;
    private BigDecimal fuelCostPerLiter;
    private String currency;
    private BigDecimal totalDistance;
    private BigDecimal totalCost;
    private List<WaypointDTO> waypoints;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
