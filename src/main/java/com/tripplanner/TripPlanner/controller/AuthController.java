package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final UserService userService;

    /**
     * Get current user information
     * Returns user details if authenticated, null otherwise
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(HttpSession session) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated() ||
                authentication.getPrincipal().equals("anonymousUser")) {
            return ResponseEntity.ok(Map.of("authenticated", false));
        }

        try {
            OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();
            String googleId = oauth2User.getAttribute("sub");

            User user = userService.findByGoogleId(googleId).orElse(null);

            if (user == null) {
                return ResponseEntity.ok(Map.of("authenticated", false));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("authenticated", true);
            response.put("id", user.getId());
            response.put("email", user.getEmail());
            response.put("name", user.getName());
            response.put("picture", user.getPictureUrl());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Error retrieving user info", e);
            return ResponseEntity.ok(Map.of("authenticated", false));
        }
    }

    /**
     * Check authentication status
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> getAuthStatus() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        boolean isAuthenticated = authentication != null &&
                authentication.isAuthenticated() &&
                !authentication.getPrincipal().equals("anonymousUser");

        return ResponseEntity.ok(Map.of("authenticated", isAuthenticated));
    }

    /**
     * Get CSRF token
     * This endpoint ensures CSRF token is generated and available
     */
    @GetMapping("/csrf")
    public ResponseEntity<Map<String, String>> getCsrfToken(CsrfToken csrfToken) {
        if (csrfToken != null) {
            return ResponseEntity.ok(Map.of(
                    "token", csrfToken.getToken(),
                    "headerName", csrfToken.getHeaderName(),
                    "parameterName", csrfToken.getParameterName()
            ));
        }
        return ResponseEntity.ok(Map.of());
    }
}
