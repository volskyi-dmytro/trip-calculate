package com.tripplanner.TripPlanner.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class WaypointDTO {
    private Long id;
    private Integer positionOrder;
    private String name;
    private BigDecimal latitude;
    private BigDecimal longitude;
}
