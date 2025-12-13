package com.tripplanner.TripPlanner.dto;

import lombok.Data;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

@Data
public class SaveRouteRequest {
    @NotBlank(message = "Route name is required")
    @Size(max = 255)
    private String name;

    @NotNull
    @DecimalMin(value = "0.1")
    @DecimalMax(value = "50.0")
    private BigDecimal fuelConsumption;

    @NotNull
    @DecimalMin(value = "0.01")
    private BigDecimal fuelCostPerLiter;

    @NotBlank
    @Size(max = 10)
    private String currency;

    @Min(value = 1, message = "At least 1 passenger required")
    @Max(value = 99, message = "Maximum 99 passengers allowed")
    private Integer passengerCount = 1;

    @NotNull
    @Size(min = 2, message = "At least 2 waypoints required")
    private List<WaypointDTO> waypoints;
}
