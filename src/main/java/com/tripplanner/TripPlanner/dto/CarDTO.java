package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CarDTO {
    private Long id;
    private String name;
    private String makeModel;
    private String fuelType;
    private BigDecimal fuelConsumption;
    private Boolean isDefault;
    private String source;
}
