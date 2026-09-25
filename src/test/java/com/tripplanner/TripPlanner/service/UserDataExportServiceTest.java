package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import com.tripplanner.TripPlanner.entity.AiUsageLog;
import com.tripplanner.TripPlanner.entity.Car;
import com.tripplanner.TripPlanner.entity.FeatureAccess;
import com.tripplanner.TripPlanner.entity.Route;
import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.entity.Waypoint;
import com.tripplanner.TripPlanner.repository.AccessRequestRepository;
import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.CarRepository;
import com.tripplanner.TripPlanner.repository.FeatureAccessRepository;
import com.tripplanner.TripPlanner.repository.RouteRepository;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserDataExportServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final RouteRepository routes = mock(RouteRepository.class);
    private final CarRepository cars = mock(CarRepository.class);
    private final TripReceiptRepository receipts = mock(TripReceiptRepository.class);
    private final AiUsageLogRepository aiUsage = mock(AiUsageLogRepository.class);
    private final FeatureAccessRepository featureAccess = mock(FeatureAccessRepository.class);
    private final AccessRequestRepository accessRequests = mock(AccessRequestRepository.class);
    private final UserDataExportService service = new UserDataExportService(
            users, routes, cars, receipts, aiUsage, featureAccess, accessRequests);

    @Test
    @SuppressWarnings("unchecked")
    void exportContainsEverythingStoredAboutTheUser() {
        User user = new User();
        user.setId(42L);
        user.setEmail("user@example.com");
        user.setGoogleId("google-sub-42");
        when(users.findById(42L)).thenReturn(Optional.of(user));

        Route route = new Route();
        route.setName("Kyiv - Lviv");
        Waypoint stop = new Waypoint();
        stop.setName("Kyiv");
        stop.setLatitude(new BigDecimal("50.45"));
        stop.setLongitude(new BigDecimal("30.52"));
        route.setWaypoints(List.of(stop));
        when(routes.findByUserIdOrderByUpdatedAtDesc(42L)).thenReturn(List.of(route));

        Car car = new Car();
        car.setName("Family car");
        when(cars.findByUserIdOrderByIsDefaultDescUpdatedAtDesc(42L)).thenReturn(List.of(car));

        TripReceipt receipt = new TripReceipt();
        receipt.setSlug("abc12345");
        when(receipts.findByUserIdOrderByCreatedAtDesc(42L)).thenReturn(List.of(receipt));

        AiUsageLog log = new AiUsageLog();
        log.setPrompt("Kyiv to Lviv");
        log.setIpAddress("203.0.113.7");
        when(aiUsage.findByUserIdOrderByTimestampDesc(42L)).thenReturn(List.of(log));

        FeatureAccess access = new FeatureAccess();
        access.setRoutePlannerEnabled(true);
        access.setGrantedBy("admin@example.com");
        access.setNotes("Early tester");
        when(featureAccess.findByUserId(42L)).thenReturn(Optional.of(access));

        AccessRequest request = new AccessRequest();
        request.setFeatureName("route_planner");
        request.setUserEmail("user@example.com");
        when(accessRequests.findByUserIdOrderByRequestedAtDesc(42L)).thenReturn(List.of(request));

        Map<String, Object> export = service.export(42L);

        assertNotNull(export.get("exportedAt"));
        assertEquals("user@example.com", ((Map<String, Object>) export.get("profile")).get("email"));
        Map<String, Object> firstRoute = ((List<Map<String, Object>>) export.get("savedRoutes")).get(0);
        assertEquals("Kyiv - Lviv", firstRoute.get("name"));
        assertEquals("Kyiv", ((List<Map<String, Object>>) firstRoute.get("waypoints")).get(0).get("name"));
        assertEquals("Family car", ((List<Map<String, Object>>) export.get("cars")).get(0).get("name"));
        assertEquals("abc12345", ((List<Map<String, Object>>) export.get("receipts")).get(0).get("slug"));
        Map<String, Object> ai = ((List<Map<String, Object>>) export.get("aiRequests")).get(0);
        assertEquals("Kyiv to Lviv", ai.get("prompt"));
        assertEquals("203.0.113.7", ai.get("ipAddress"));
        // Account deletion also erases these, so the export must include them.
        Map<String, Object> exportedAccess = (Map<String, Object>) export.get("featureAccess");
        assertEquals(true, exportedAccess.get("routePlannerEnabled"));
        assertEquals("Early tester", exportedAccess.get("notes"));
        assertEquals("route_planner",
                ((List<Map<String, Object>>) export.get("accessRequests")).get(0).get("featureName"));
    }

    @Test
    void exportShowsNoFeatureAccessWhenNoneWasGranted() {
        User user = new User();
        user.setId(7L);
        when(users.findById(7L)).thenReturn(Optional.of(user));
        when(featureAccess.findByUserId(7L)).thenReturn(Optional.empty());

        Map<String, Object> export = service.export(7L);

        assertNull(export.get("featureAccess"));
        assertEquals(List.of(), export.get("accessRequests"));
    }
}
