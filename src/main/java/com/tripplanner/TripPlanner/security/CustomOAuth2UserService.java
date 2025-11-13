package com.tripplanner.TripPlanner.security;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Custom OAuth2UserService that loads user authorities from the database
 * This enables role-based access control with @PreAuthorize annotations
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private final UserService userService;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        log.info("CustomOAuth2UserService.loadUser() called - Loading OAuth2 user from provider");

        // Load the OAuth2 user from Google
        OAuth2User oauth2User = super.loadUser(userRequest);

        // Get Google ID from the OAuth2 user
        String googleId = oauth2User.getAttribute("sub");
        log.info("OAuth2 user loaded - Google ID: {}", googleId);

        // Find or create user in database
        User user = userService.findByGoogleId(googleId).orElse(null);

        if (user == null) {
            log.warn("User not found in database for Google ID: {}. Assigning default ROLE_USER", googleId);
            // New user - will be created by processOAuth2User in success handler
            // For now, assign USER role as default
            Set<GrantedAuthority> authorities = new HashSet<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));

            return new DefaultOAuth2User(authorities, oauth2User.getAttributes(), "sub");
        }

        log.info("Found user in database - ID: {}, email: {}, role: {}", user.getId(), user.getEmail(), user.getRole());

        // Update last login timestamp
        user.setLastLogin(LocalDateTime.now());
        userService.save(user);

        // Build authorities based on user role
        Set<GrantedAuthority> authorities = new HashSet<>();
        String roleAuthority = "ROLE_" + user.getRole().name();
        authorities.add(new SimpleGrantedAuthority(roleAuthority));

        log.info("Granting authority '{}' to user ID: {}", roleAuthority, user.getId());

        // Return OAuth2User with authorities from database
        return new DefaultOAuth2User(authorities, oauth2User.getAttributes(), "sub");
    }
}
