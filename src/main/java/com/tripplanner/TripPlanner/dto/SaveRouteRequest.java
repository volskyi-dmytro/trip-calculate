package com.tripplanner.TripPlanner.dto;

import lombok.Data;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
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

    @Pattern(regexp = "^[a-z0-9_-]{1,20}$", message = "Invalid fuel type")
    private String fuelType;

    private LocalDate departureDate;

    /** Update only: the updatedAt the client loaded. A newer stored row means another session edited it (409 ROUTE_CHANGED). Optional for older clients. */
    private java.time.Instant expectedUpdatedAt;

    @NotNull
    @Size(min = 2, max = 100, message = "2 to 100 waypoints required")
    private List<@Valid WaypointDTO> waypoints;

    /**
     * Optional: what the client displayed. The server always recomputes the
     * road distance itself and rejects the save when this does not match, so a
     * client can neither inject totals nor save a stale view.
     */
    @Valid
    private Snapshot snapshot;

    @Data
    public static class Snapshot {
        @NotNull @DecimalMin("0")
        private BigDecimal distanceKm;
        @NotNull @Pattern(regexp = "road|approximate")
        private String quality;
    }
}
