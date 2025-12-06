package com.tripplanner.TripPlanner.controller;

import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

/**
 * Development-only auth controller that returns mock user data.
 * Allows frontend development without OAuth complexity.
 * Only active when spring.profiles.active=dev
 */
@RestController
@RequestMapping("/api/user")
@Profile("dev")
@Slf4j
public class DevAuthController {

    /**
     * Returns a mock authenticated user for development
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(HttpSession session) {
        log.info("DEV MODE: Returning mock user");

        Map<String, Object> response = new HashMap<>();
        response.put("authenticated", true);
        response.put("id", 1L);
        response.put("email", "dev@localhost");
        response.put("name", "Dev User");
        response.put("picture", "https://ui-avatars.com/api/?name=Dev+User&background=random");
        response.put("role", "USER");
        response.put("isAdmin", false);

        return ResponseEntity.ok(response);
    }

    /**
     * Always returns authenticated in dev mode
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> getAuthStatus() {
        log.info("DEV MODE: Returning authenticated status");
        return ResponseEntity.ok(Map.of("authenticated", true));
    }

    /**
     * CSRF disabled in dev mode, return empty
     */
    @GetMapping("/csrf")
    public ResponseEntity<Map<String, String>> getCsrfToken() {
        return ResponseEntity.ok(Map.of());
    }
}
