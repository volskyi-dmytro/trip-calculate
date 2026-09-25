package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.CarRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * "Download my data": everything the app stores about one user, as plain JSON.
 * Mirrors what account deletion erases (profile, routes, cars, receipts, AI
 * usage records), so the Privacy Policy's list and the export stay in step.
 */
@Service
@RequiredArgsConstructor
public class UserDataExportService {

    private final UserRepository userRepository;
    private final RouteRepository routeRepository;
    private final CarRepository carRepository;
    private final TripReceiptRepository tripReceiptRepository;
    private final AiUsageLogRepository aiUsageLogRepository;

    @Transactional(readOnly = true)
    public Map<String, Object> export(Long userId) {
        User user = userRepository.findById(userId).orElseThrow(NoSuchElementException::new);

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("exportedAt", Instant.now().toString());
        export.put("profile", row(
                "email", user.getEmail(),
                "name", user.getName(),
                "displayName", user.getDisplayName(),
                "googleAccountId", user.getGoogleId(),
                "pictureUrl", user.getPictureUrl(),
                "role", user.getRole(),
                "preferredLanguage", user.getPreferredLanguage(),
                "defaultFuelConsumption", user.getDefaultFuelConsumption(),
                "emailNotificationsEnabled", user.getEmailNotificationsEnabled(),
                "createdAt", user.getCreatedAt(),
                "lastLogin", user.getLastLogin()));
        export.put("savedRoutes", routeRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(route -> row(
                        "name", route.getName(),
                        "fuelConsumption", route.getFuelConsumption(),
                        "fuelCostPerLiter", route.getFuelCostPerLiter(),
                        "currency", route.getCurrency(),
                        "passengerCount", route.getPassengerCount(),
                        "totalDistance", route.getTotalDistance(),
                        "totalCost", route.getTotalCost(),
                        "createdAt", route.getCreatedAt(),
                        "updatedAt", route.getUpdatedAt(),
                        "waypoints", route.getWaypoints().stream()
                                .map(w -> row(
                                        "name", w.getName(),
                                        "latitude", w.getLatitude(),
                                        "longitude", w.getLongitude()))
                                .toList()))
                .toList());
        export.put("cars", carRepository.findByUserIdOrderByIsDefaultDescUpdatedAtDesc(userId).stream()
                .map(car -> row(
                        "name", car.getName(),
                        "makeModel", car.getMakeModel(),
                        "fuelType", car.getFuelType(),
                        "fuelConsumption", car.getFuelConsumption(),
                        "isDefault", car.getIsDefault(),
                        "createdAt", car.getCreatedAt()))
                .toList());
        export.put("receipts", tripReceiptRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(r -> row(
                        "slug", r.getSlug(),
                        "originLabel", r.getOriginLabel(),
                        "destinationLabel", r.getDestinationLabel(),
                        "distanceKm", r.getDistanceKm(),
                        "fuelConsumption", r.getFuelConsumption(),
                        "fuelPrice", r.getFuelPrice(),
                        "currency", r.getCurrency(),
                        "people", r.getPeople(),
                        "totalCost", r.getTotalCost(),
                        "costPerPerson", r.getCostPerPerson(),
                        "routeGeometry", r.getRouteGeometry(),
                        "viewCount", r.getViewCount(),
                        "createdAt", r.getCreatedAt()))
                .toList());
        export.put("aiRequests", aiUsageLogRepository.findByUserIdOrderByTimestampDesc(userId).stream()
                .map(log -> row(
                        "timestamp", log.getTimestamp(),
                        "prompt", log.getPrompt(),
                        "language", log.getLanguage(),
                        "ipAddress", log.getIpAddress(),
                        "status", log.getResponseStatus()))
                .toList());
        return export;
    }

    // Map.of() rejects nulls; missing values are normal here.
    private static Map<String, Object> row(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }
}
