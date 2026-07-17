package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SaveCarRequest {
    private String name;
    private String makeModel;
    private String fuelType;
    private BigDecimal fuelConsumption;
    private Boolean isDefault;
    private String source;
}
