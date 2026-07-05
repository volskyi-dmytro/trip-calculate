package com.tripplanner.TripPlanner.dto;

import lombok.Data;

/**
 * Client payload for creating a receipt. All numerics are boxed so the
 * service can distinguish "missing" from zero and reject accordingly.
 */
@Data
public class CreateReceiptRequest {
    private String originLabel;
    private String destinationLabel;
    private Double distanceKm;
    private Double fuelConsumption;
    private Double fuelPrice;
    private String currency;
    private Integer people;
    private String locale;
    private String routeGeometry;
}
