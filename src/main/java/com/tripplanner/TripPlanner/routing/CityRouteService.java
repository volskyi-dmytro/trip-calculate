package com.tripplanner.TripPlanner.routing;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enriches {@link CityRouteCatalog} entries with a distance (live Mapbox/OSRM,
 * cached ~24h per slug, falling back to the curated estimate) and the current
 * Ukraine petrol price, for the programmatic city-route SEO landing pages.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CityRouteService {

    private static final double CONSUMPTION_L_PER_100KM = 7.5;
    private static final int PASSENGERS = 4;
    // ponytail: process-local cache, lost on restart/scale-out; fine for a ~20-row
    // catalog refreshed at most once/24h. Upgrade to Redis if this runs multi-instance.
    private static final Duration CACHE_TTL = Duration.ofHours(24);
    // Failed lookups are cached briefly so a crawler walking every city page while
    // Mapbox/OSRM are down doesn't pay the full provider-timeout chain per request.
    private static final Duration FAILURE_TTL = Duration.ofHours(1);

    private final RoutingService routingService;
    private final JdbcTemplate jdbc;

    private final Map<String, CachedDistance> cache = new ConcurrentHashMap<>();

    private record CachedDistance(double km, double minutes, boolean live, Instant fetchedAt) {
        boolean isFresh() {
            return fetchedAt.plus(live ? CACHE_TTL : FAILURE_TTL).isAfter(Instant.now());
        }
    }

    public List<CityRouteCatalog.CityRoute> all() {
        return CityRouteCatalog.ALL;
    }

    public Optional<Map<String, Object>> get(String slug, String locale) {
        CityRouteCatalog.CityRoute route = CityRouteCatalog.find(slug);
        if (route == null) {
            return Optional.empty();
        }
        boolean english = "en".equalsIgnoreCase(locale);

        DistanceResult distance = distanceFor(route);
        FuelPrice fuel = fuelPrice();

        Double totalCost = null;
        Double perPassenger = null;
        if (fuel != null) {
            double cost = distance.km() * (CONSUMPTION_L_PER_100KM / 100.0) * fuel.pricePerLiter();
            totalCost = round2(cost);
            perPassenger = round2(cost / PASSENGERS);
        }

        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("slug", route.slug());
        dto.put("fromName", english ? route.from().en() : route.from().uk());
        dto.put("toName", english ? route.to().en() : route.to().uk());
        dto.put("distanceKm", round2(distance.km()));
        dto.put("durationMin", Math.round(distance.minutes()));
        dto.put("distanceSource", distance.live() ? "live" : "estimate");
        dto.put("fuelType", "petrol");
        dto.put("fuelPricePerLiter", fuel != null ? round2(fuel.pricePerLiter()) : null);
        dto.put("fuelPriceDate", fuel != null ? fuel.fetchedAt().toString() : null);
        dto.put("currency", "UAH");
        dto.put("consumptionL100", CONSUMPTION_L_PER_100KM);
        dto.put("passengers", PASSENGERS);
        dto.put("totalCost", totalCost);
        dto.put("perPassenger", perPassenger);
        dto.put("from", Map.of("lat", route.from().lat(), "lng", route.from().lng()));
        dto.put("to", Map.of("lat", route.to().lat(), "lng", route.to().lng()));
        dto.put("related", relatedFor(route, english));
        return Optional.of(dto);
    }

    private List<Map<String, Object>> relatedFor(CityRouteCatalog.CityRoute route, boolean english) {
        List<Map<String, Object>> related = new ArrayList<>();
        for (CityRouteCatalog.CityRoute other : CityRouteCatalog.related(route, 5)) {
            related.add(Map.of(
                    "slug", other.slug(),
                    "fromName", english ? other.from().en() : other.from().uk(),
                    "toName", english ? other.to().en() : other.to().uk()));
        }
        return related;
    }

    private record DistanceResult(double km, double minutes, boolean live) {}

    private DistanceResult distanceFor(CityRouteCatalog.CityRoute route) {
        CachedDistance cached = cache.get(route.slug());
        if (cached != null && cached.isFresh()) {
            return new DistanceResult(cached.km(), cached.minutes(), cached.live());
        }
        try {
            List<RoutingController.Waypoint> waypoints = List.of(
                    new RoutingController.Waypoint(route.from().lat(), route.from().lng()),
                    new RoutingController.Waypoint(route.to().lat(), route.to().lng()));
            Map<String, Object> result = routingService.calculateRoute(waypoints);
            double km = ((Number) result.getOrDefault("totalDistance", 0)).doubleValue();
            double minutes = ((Number) result.getOrDefault("totalDuration", 0)).doubleValue();
            if (km > 0) {
                cache.put(route.slug(), new CachedDistance(km, minutes, true, Instant.now()));
                return new DistanceResult(km, minutes, true);
            }
        } catch (Exception e) {
            log.warn("Live routing failed for city-route {}, using catalog estimate: {}", route.slug(), e.getMessage());
        }
        cache.put(route.slug(), new CachedDistance(route.estDistanceKm(), route.estDurationMin(), false, Instant.now()));
        return new DistanceResult(route.estDistanceKm(), route.estDurationMin(), false);
    }

    private record FuelPrice(double pricePerLiter, Instant fetchedAt) {}

    private FuelPrice fuelPrice() {
        // Fuel data is advisory: a DB/table failure must degrade to "no price",
        // never break the landing page or the API response.
        try {
            return queryFuelPrice();
        } catch (Exception e) {
            log.warn("Fuel price lookup failed for city-routes: {}", e.getMessage());
            return null;
        }
    }

    private FuelPrice queryFuelPrice() {
        List<FuelPrice> rows = jdbc.query(
                "SELECT price, currency, fetched_at FROM fuel_prices WHERE fuel_type = 'petrol' AND country_code = 'UA'",
                (rs, rowNum) -> {
                    String currency = rs.getString("currency").trim();
                    if (!"UAH".equals(currency)) {
                        // ponytail: UA petrol is always seeded/refreshed in UAH; never invent
                        // a converted price for an unexpected currency here.
                        return null;
                    }
                    return new FuelPrice(rs.getDouble("price"), rs.getTimestamp("fetched_at").toInstant());
                });
        return rows.stream().filter(java.util.Objects::nonNull).findFirst().orElse(null);
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
