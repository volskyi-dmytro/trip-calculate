package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.*;
import com.tripplanner.TripPlanner.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RouteService {
    private final RouteRepository routeRepository;
    private final WaypointRepository waypointRepository;
    private final FeatureAccessRepository featureAccessRepository;

    @Transactional(readOnly = true)
    public List<RouteDTO> getUserRoutes(Long userId) {
        return routeRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public RouteDTO getRoute(Long routeId, Long userId) {
        Route route = routeRepository.findByIdAndUserId(routeId, userId)
                .orElseThrow(() -> new RuntimeException("Route not found"));
        return convertToDTO(route);
    }

    @Transactional
    public RouteDTO saveRoute(SaveRouteRequest request, Long userId) {
        // Check if user has access
        checkFeatureAccess(userId);

        Route route = new Route();
        route.setUserId(userId);
        route.setName(request.getName());
        route.setFuelConsumption(request.getFuelConsumption());
        route.setFuelCostPerLiter(request.getFuelCostPerLiter());
        route.setCurrency(request.getCurrency());
        route.setPassengerCount(request.getPassengerCount() != null ? request.getPassengerCount() : 1);

        // Calculate totals
        BigDecimal totalDistance = calculateTotalDistance(request.getWaypoints());
        route.setTotalDistance(totalDistance);

        BigDecimal fuelNeeded = totalDistance.divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                .multiply(request.getFuelConsumption());
        BigDecimal totalCost = fuelNeeded.multiply(request.getFuelCostPerLiter());
        route.setTotalCost(totalCost);

        // Save route first
        route = routeRepository.save(route);

        // Add waypoints
        for (int i = 0; i < request.getWaypoints().size(); i++) {
            WaypointDTO wpDto = request.getWaypoints().get(i);
            Waypoint waypoint = new Waypoint();
            waypoint.setRoute(route);
            waypoint.setPositionOrder(i);
            waypoint.setName(wpDto.getName());
            waypoint.setLatitude(wpDto.getLatitude());
            waypoint.setLongitude(wpDto.getLongitude());
            route.getWaypoints().add(waypoint);
        }

        route = routeRepository.save(route);
        return convertToDTO(route);
    }

    @Transactional
    public RouteDTO updateRoute(Long routeId, SaveRouteRequest request, Long userId) {
        Route route = routeRepository.findByIdAndUserId(routeId, userId)
                .orElseThrow(() -> new RuntimeException("Route not found"));

        route.setName(request.getName());
        route.setFuelConsumption(request.getFuelConsumption());
        route.setFuelCostPerLiter(request.getFuelCostPerLiter());
        route.setCurrency(request.getCurrency());
        route.setPassengerCount(request.getPassengerCount() != null ? request.getPassengerCount() : 1);

        // Clear existing waypoints
        route.getWaypoints().clear();

        // Calculate totals
        BigDecimal totalDistance = calculateTotalDistance(request.getWaypoints());
        route.setTotalDistance(totalDistance);

        BigDecimal fuelNeeded = totalDistance.divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                .multiply(request.getFuelConsumption());
        BigDecimal totalCost = fuelNeeded.multiply(request.getFuelCostPerLiter());
        route.setTotalCost(totalCost);

        // Add new waypoints
        for (int i = 0; i < request.getWaypoints().size(); i++) {
            WaypointDTO wpDto = request.getWaypoints().get(i);
            Waypoint waypoint = new Waypoint();
            waypoint.setRoute(route);
            waypoint.setPositionOrder(i);
            waypoint.setName(wpDto.getName());
            waypoint.setLatitude(wpDto.getLatitude());
            waypoint.setLongitude(wpDto.getLongitude());
            route.getWaypoints().add(waypoint);
        }

        route = routeRepository.save(route);
        return convertToDTO(route);
    }

    @Transactional
    public void deleteRoute(Long routeId, Long userId) {
        Route route = routeRepository.findByIdAndUserId(routeId, userId)
                .orElseThrow(() -> new RuntimeException("Route not found"));
        routeRepository.delete(route);
    }

    public boolean hasFeatureAccess(Long userId) {
        return featureAccessRepository.findByUserId(userId)
                .map(FeatureAccess::getRoutePlannerEnabled)
                .orElse(false);
    }

    private void checkFeatureAccess(Long userId) {
        if (!hasFeatureAccess(userId)) {
            throw new RuntimeException("Route planner access not enabled for this user");
        }
    }

    private BigDecimal calculateTotalDistance(List<WaypointDTO> waypoints) {
        if (waypoints.size() < 2) {
            return BigDecimal.ZERO;
        }

        double totalDistance = 0;
        for (int i = 0; i < waypoints.size() - 1; i++) {
            WaypointDTO from = waypoints.get(i);
            WaypointDTO to = waypoints.get(i + 1);
            totalDistance += calculateDistance(
                    from.getLatitude().doubleValue(),
                    from.getLongitude().doubleValue(),
                    to.getLatitude().doubleValue(),
                    to.getLongitude().doubleValue()
            );
        }

        return BigDecimal.valueOf(totalDistance).setScale(2, RoundingMode.HALF_UP);
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371; // Earth's radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private RouteDTO convertToDTO(Route route) {
        RouteDTO dto = new RouteDTO();
        dto.setId(route.getId());
        dto.setName(route.getName());
        dto.setFuelConsumption(route.getFuelConsumption());
        dto.setFuelCostPerLiter(route.getFuelCostPerLiter());
        dto.setCurrency(route.getCurrency());
        dto.setPassengerCount(route.getPassengerCount());
        dto.setTotalDistance(route.getTotalDistance());
        dto.setTotalCost(route.getTotalCost());
        dto.setCreatedAt(route.getCreatedAt());
        dto.setUpdatedAt(route.getUpdatedAt());
        dto.setWaypoints(route.getWaypoints().stream()
                .map(this::convertWaypointToDTO)
                .collect(Collectors.toList()));
        return dto;
    }

    private WaypointDTO convertWaypointToDTO(Waypoint waypoint) {
        WaypointDTO dto = new WaypointDTO();
        dto.setId(waypoint.getId());
        dto.setPositionOrder(waypoint.getPositionOrder());
        dto.setName(waypoint.getName());
        dto.setLatitude(waypoint.getLatitude());
        dto.setLongitude(waypoint.getLongitude());
        return dto;
    }
}
