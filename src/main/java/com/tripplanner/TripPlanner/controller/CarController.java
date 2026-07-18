package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.CarDTO;
import com.tripplanner.TripPlanner.dto.SaveCarRequest;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.CarService;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/cars")
@RequiredArgsConstructor
public class CarController {
    private final CarService carService;
    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<CarDTO>> getUserCars(@AuthenticationPrincipal OAuth2User principal) {
        return ResponseEntity.ok(carService.getUserCars(getUserId(principal)));
    }

    @PostMapping
    public ResponseEntity<?> createCar(@RequestBody SaveCarRequest request,
                                       @AuthenticationPrincipal OAuth2User principal) {
        try {
            return ResponseEntity.ok(carService.createCar(getUserId(principal), request));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateCar(@PathVariable Long id,
                                       @RequestBody SaveCarRequest request,
                                       @AuthenticationPrincipal OAuth2User principal) {
        try {
            return ResponseEntity.ok(carService.updateCar(id, getUserId(principal), request));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteCar(@PathVariable Long id,
                                       @AuthenticationPrincipal OAuth2User principal) {
        try {
            carService.deleteCar(id, getUserId(principal));
            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/default")
    public ResponseEntity<?> setDefault(@PathVariable Long id,
                                        @AuthenticationPrincipal OAuth2User principal) {
        try {
            return ResponseEntity.ok(carService.setDefault(id, getUserId(principal)));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    private Long getUserId(OAuth2User principal) {
        String googleId = principal.getAttribute("sub");
        User user = userService.findByGoogleId(googleId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return user.getId();
    }
}
