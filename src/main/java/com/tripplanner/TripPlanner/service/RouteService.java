package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.*;
import com.tripplanner.TripPlanner.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.math.RoundingMode;
import com.tripplanner.TripPlanner.routing.RoutingController;
import com.tripplanner.TripPlanner.routing.RoutingService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RouteService {
    private final RouteRepository routeRepository;
    private final WaypointRepository waypointRepository;
    private final RoutingService routingService;
    private final PlatformTransactionManager transactionManager;
    private final RouteSaveLimiter saveLimiter;
    private final EntityManagerFactory entityManagerFactory;

    /** Bump when the distance/cost arithmetic changes; stored with every saved route. */
    static final String CALCULATION_VERSION = "route-save/2";


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

    // Suspend a caller's transaction before admission/routing; templates below own only short DB work.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public RouteDTO saveRoute(SaveRouteRequest request, Long userId) {
        try (RequestContext context = suspendRequestContext();
             RouteSaveLimiter.Lease ignored = saveLimiter.acquire(userId)) {
            Estimate estimate = estimate(request);
            return new TransactionTemplate(transactionManager).execute(status -> {
                Route route = new Route();
                route.setUserId(userId);
                apply(route, request, estimate);
                return convertToDTO(routeRepository.save(route));
            });
        }
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public RouteDTO updateRoute(Long routeId, SaveRouteRequest request, Long userId) {
        try (RequestContext context = suspendRequestContext();
             RouteSaveLimiter.Lease ignored = saveLimiter.acquire(userId)) {
            TransactionTemplate read = new TransactionTemplate(transactionManager);
            read.setReadOnly(true);
            RouteDTO baseline = read.execute(status -> convertToDTO(routeRepository.findByIdAndUserId(routeId, userId)
                    .orElseThrow(RouteService::notFound)));
            Estimate estimate = estimate(request);
            return new TransactionTemplate(transactionManager).execute(status -> {
                Route route = routeRepository.findRootForUpdate(routeId)
                        .filter(r -> userId.equals(r.getUserId()))
                        .orElseThrow(RouteService::notFound);
                // Includes updatedAt and all inputs/results/children, initialized under the root lock.
                if (!baseline.equals(convertToDTO(route))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "ROUTE_CHANGED");
                }
                route.getWaypoints().clear();
                apply(route, request, estimate);
                routeRepository.save(route);
                routeRepository.flush();
                return convertToDTO(route);
            });
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Route not found");
    }

    /**
     * NOT_SUPPORTED suspends actual caller transactions, but not an idle OSIV EntityManager.
     * Unbind that request context too: each template must read fresh state using its own
     * short-lived persistence context. Unbinding does not release any physical connection
     * already held by the caller: the controller's scalar identity lookup owns/closes its
     * own context, while arbitrary caller-owned resources remain their owner's responsibility.
     * Restore the untouched request holder for its owning interceptor to clean up normally.
     */
    private RequestContext suspendRequestContext() {
        return new RequestContext(entityManagerFactory,
                TransactionSynchronizationManager.unbindResourceIfPossible(entityManagerFactory));
    }

    private record RequestContext(EntityManagerFactory factory, Object previous) implements AutoCloseable {
        @Override public void close() {
            if (previous != null) TransactionSynchronizationManager.bindResource(factory, previous);
        }
    }

    /** Copies inputs and recomputes every derived figure on the server. */
    private void apply(Route route, SaveRouteRequest request, Estimate estimate) {
        route.setName(request.getName());
        route.setFuelConsumption(RouteCost.normalize(request.getFuelConsumption()));
        route.setFuelCostPerLiter(RouteCost.normalize(request.getFuelCostPerLiter()));
        route.setCurrency(request.getCurrency());
        route.setPassengerCount(request.getPassengerCount() != null ? request.getPassengerCount() : 1);
        route.setFuelType(request.getFuelType());
        route.setDepartureDate(request.getDepartureDate());

        route.setTotalDistance(estimate.km());
        route.setTotalDurationMinutes(estimate.minutes());
        route.setDistanceQuality(estimate.quality());
        route.setDistanceSource(estimate.source());
        route.setCalculationVersion(CALCULATION_VERSION);
        route.setCalculatedAt(LocalDateTime.now());
        // Same formula as the planner: km / 100 * L/100km * price, rounded once.
        route.setTotalCost(RouteCost.total(estimate.km(), route.getFuelConsumption(), route.getFuelCostPerLiter()));

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
    }

    private record Estimate(BigDecimal km, Integer minutes, String quality, String source) {}

    /**
     * Road distance from the same routing service the planner uses; straight-line
     * (labelled "approximate") only if every provider is down. A client snapshot is
     * verified against this, never trusted.
     */
    private Estimate estimate(SaveRouteRequest request) {
        List<RoutingController.Waypoint> points = request.getWaypoints().stream()
                .map(w -> new RoutingController.Waypoint(w.getLatitude().doubleValue(), w.getLongitude().doubleValue()))
                .toList();

        Map<String, Object> routed;
        try {
            routed = routingService.calculateRoute(points);
        } catch (Exception e) {
            routed = Map.of();
        }
        if (Boolean.TRUE.equals(routed.get("noRoute"))) {
            throw new IllegalArgumentException("No drivable route between the waypoints");
        }

        Estimate estimate;
        if ("road".equals(routed.get("quality")) && routed.get("totalDistance") instanceof Number km && km.doubleValue() > 0) {
            Integer minutes = routed.get("totalDuration") instanceof Number d ? (int) Math.round(d.doubleValue()) : null;
            estimate = new Estimate(BigDecimal.valueOf(km.doubleValue()).setScale(2, RoundingMode.HALF_UP), minutes,
                    "road", String.valueOf(routed.getOrDefault("provider", "road-router")));
        } else {
            estimate = new Estimate(calculateTotalDistance(request.getWaypoints()), null, "approximate", "straight-line");
        }

        SaveRouteRequest.Snapshot claimed = request.getSnapshot();
        if (claimed != null) {
            if (!estimate.quality().equals(claimed.getQuality())
                    || claimed.getDistanceKm() == null || claimed.getDistanceKm().signum() < 0
                    || RouteCost.normalize(claimed.getDistanceKm()).compareTo(estimate.km()) != 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "ROUTE_SNAPSHOT_STALE");
            }
        }
        return estimate;
    }

    @Transactional
    public void deleteRoute(Long routeId, Long userId) {
        Route route = routeRepository.findByIdAndUserId(routeId, userId)
                .orElseThrow(() -> new RuntimeException("Route not found"));
        routeRepository.delete(route);
    }

    public boolean hasFeatureAccess(Long userId) {
        return true;
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
        dto.setFuelType(route.getFuelType());
        dto.setDepartureDate(route.getDepartureDate());
        dto.setTotalDurationMinutes(route.getTotalDurationMinutes());
        // Null quality = saved before provenance existed: straight-line totals, reported as legacy, never upgraded.
        dto.setDistanceQuality(route.getDistanceQuality() != null ? route.getDistanceQuality() : "legacy");
        dto.setDistanceSource(route.getDistanceSource());
        dto.setCalculationVersion(route.getCalculationVersion());
        dto.setCalculatedAt(route.getCalculatedAt());
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
