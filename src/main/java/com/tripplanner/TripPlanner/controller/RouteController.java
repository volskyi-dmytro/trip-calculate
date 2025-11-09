package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.RouteService;
import com.tripplanner.TripPlanner.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/routes")
@RequiredArgsConstructor
public class RouteController {
    private final RouteService routeService;
    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<RouteDTO>> getUserRoutes(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        return ResponseEntity.ok(routeService.getUserRoutes(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<RouteDTO> getRoute(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        return ResponseEntity.ok(routeService.getRoute(id, userId));
    }

    @PostMapping
    public ResponseEntity<RouteDTO> createRoute(
            @Valid @RequestBody SaveRouteRequest request,
            @AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        return ResponseEntity.ok(routeService.saveRoute(request, userId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<RouteDTO> updateRoute(
            @PathVariable Long id,
            @Valid @RequestBody SaveRouteRequest request,
            @AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        return ResponseEntity.ok(routeService.updateRoute(id, request, userId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteRoute(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        routeService.deleteRoute(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/access")
    public ResponseEntity<Boolean> checkAccess(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        return ResponseEntity.ok(routeService.hasFeatureAccess(userId));
    }

    private Long getUserId(OAuth2User principal) {
        String googleId = principal.getAttribute("sub");
        User user = userService.findByGoogleId(googleId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return user.getId();
    }
}
