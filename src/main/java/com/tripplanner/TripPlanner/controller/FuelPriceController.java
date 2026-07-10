package com.tripplanner.TripPlanner.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Stream;

/**
 * Read-only country-average fuel prices for the manual route flow.
 * The tables are owned and refreshed by the Python agent service; reading
 * them directly here avoids an inter-service hop for what is a plain lookup.
 */
@RestController
@RequestMapping("/api/fuel-prices")
public class FuelPriceController {

    private static final Set<String> FUEL_TYPES = Set.of("petrol", "diesel", "lpg");
    private static final Set<String> CURRENCIES = Set.of("UAH", "USD", "EUR");
    private static final int MAX_COUNTRIES = 10;
    private static final int STALE_AFTER_DAYS = 14;

    private final JdbcTemplate jdbc;

    public FuelPriceController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> getPrices(@RequestParam String countries,
                                       @RequestParam(defaultValue = "petrol") String type,
                                       @RequestParam(defaultValue = "UAH") String currency) {
        if (!FUEL_TYPES.contains(type)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Unknown fuel type"));
        }
        if (!CURRENCIES.contains(currency)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Unknown currency"));
        }
        List<String> codes = Arrays.stream(countries.split(","))
                .map(String::trim).map(String::toUpperCase)
                .filter(c -> c.matches("[A-Z]{2}"))
                .distinct().limit(MAX_COUNTRIES).toList();
        if (codes.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No valid country codes"));
        }

        // UAH-pivot rates: currency → UAH per unit (NBU publishes exactly this)
        Map<String, Double> uahRates = new HashMap<>();
        uahRates.put("UAH", 1.0);
        jdbc.query("SELECT base, rate FROM fx_rates WHERE trim(quote) = 'UAH'",
                rs -> { uahRates.put(rs.getString("base").trim(), rs.getDouble("rate")); });

        Instant staleBefore = Instant.now().minus(Duration.ofDays(STALE_AFTER_DAYS));
        String placeholders = String.join(",", Collections.nCopies(codes.size(), "?"));
        Object[] args = Stream.concat(Stream.of(type), codes.stream()).toArray();

        List<Map<String, Object>> prices = new ArrayList<>();
        jdbc.query("SELECT country_code, price, currency, source, fetched_at FROM fuel_prices "
                        + "WHERE fuel_type = ? AND country_code IN (" + placeholders + ")",
                (rs, rowNum) -> {
                    Double fromRate = uahRates.get(rs.getString("currency").trim());
                    Double toRate = uahRates.get(currency);
                    if (fromRate == null || toRate == null) {
                        return null; // unconvertible row → silently absent
                    }
                    Instant fetchedAt = rs.getTimestamp("fetched_at").toInstant();
                    Map<String, Object> row = new HashMap<>();
                    row.put("code", rs.getString("country_code").trim());
                    row.put("pricePerLiter",
                            Math.round(rs.getDouble("price") * fromRate / toRate * 1000.0) / 1000.0);
                    row.put("source", rs.getString("source"));
                    row.put("fetchedAt", fetchedAt.toString());
                    row.put("stale", fetchedAt.isBefore(staleBefore));
                    return row;
                }, args).forEach(row -> { if (row != null) prices.add(row); });

        return ResponseEntity.ok(Map.of("currency", currency, "fuelType", type, "prices", prices));
    }
}
