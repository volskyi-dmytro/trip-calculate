package com.tripplanner.TripPlanner.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Structured parameters extracted from user's trip request
 * Used for semantic caching - similar trips cache together
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteParameters {

    /**
     * Origin city (normalized, e.g., "Kyiv", "Lviv")
     */
    private String fromCity;

    /**
     * Destination city (normalized)
     */
    private String toCity;

    /**
     * Number of passengers
     */
    private Integer passengerCount;

    /**
     * Additional trip characteristics (optional)
     * e.g., "budget", "comfort", "fast"
     */
    private String tripType;

    /**
     * Generate a normalized cache key from parameters
     * Format: "fromCity->toCity|passengers|tripType"
     */
    public String toCacheKey() {
        StringBuilder key = new StringBuilder();

        // Normalize city names (trim, lowercase, handle null)
        String from = normalizeCity(fromCity);
        String to = normalizeCity(toCity);

        key.append(from).append("->").append(to);

        if (passengerCount != null && passengerCount > 0) {
            key.append("|p").append(passengerCount);
        }

        if (tripType != null && !tripType.trim().isEmpty()) {
            key.append("|").append(tripType.toLowerCase().trim());
        }

        return key.toString();
    }

    /**
     * Normalize city name for consistent caching
     */
    private String normalizeCity(String city) {
        if (city == null || city.trim().isEmpty()) {
            return "unknown";
        }
        return city.trim().toLowerCase();
    }

    /**
     * Check if parameters are valid for caching
     */
    public boolean isValid() {
        return fromCity != null && !fromCity.trim().isEmpty()
            && toCity != null && !toCity.trim().isEmpty();
    }
}
