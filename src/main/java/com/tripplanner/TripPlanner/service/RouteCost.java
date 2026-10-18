package com.tripplanner.TripPlanner.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Decimal contract shared by newly saved routes and receipts; never applied on reads. */
public final class RouteCost {
    private RouteCost() {}

    public static BigDecimal normalize(BigDecimal value) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException("Cost inputs must be nonnegative");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal total(BigDecimal distance, BigDecimal consumption, BigDecimal price) {
        return normalize(distance).multiply(normalize(consumption)).multiply(normalize(price))
                .movePointLeft(2).setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal perPerson(BigDecimal roundedTotal, int people) {
        if (people < 1) throw new IllegalArgumentException("At least one person required");
        return roundedTotal.divide(BigDecimal.valueOf(people), 2, RoundingMode.HALF_UP);
    }
}
