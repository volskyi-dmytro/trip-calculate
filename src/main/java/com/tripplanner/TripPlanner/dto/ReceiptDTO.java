package com.tripplanner.TripPlanner.dto;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class ReceiptDTO {
    private String slug;
    private String originLabel;
    private String destinationLabel;
    private BigDecimal distanceKm;
    private BigDecimal fuelConsumption;
    private BigDecimal fuelPrice;
    private String currency;
    private Integer people;
    private BigDecimal totalCost;
    private BigDecimal costPerPerson;
    private String locale;
    private String routeGeometry;
    private LocalDateTime createdAt;
    private LocalDateTime expiresAt;
    private Long viewCount;

    public static ReceiptDTO from(TripReceipt r) {
        return new ReceiptDTO(
                r.getSlug(), r.getOriginLabel(), r.getDestinationLabel(),
                r.getDistanceKm(), r.getFuelConsumption(), r.getFuelPrice(),
                r.getCurrency(), r.getPeople(), r.getTotalCost(), r.getCostPerPerson(),
                r.getLocale(), r.getRouteGeometry(),
                r.getCreatedAt(), r.getExpiresAt(), r.getViewCount());
    }
}
