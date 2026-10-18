package com.tripplanner.TripPlanner.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.math.BigDecimal;

@Data
public class WaypointDTO {
    private Long id;
    private Integer positionOrder;
    @Size(max = 255)
    private String name;
    @NotNull @DecimalMin("-90") @DecimalMax("90")
    private BigDecimal latitude;
    @NotNull @DecimalMin("-180") @DecimalMax("180")
    private BigDecimal longitude;
}
