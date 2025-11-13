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
        // Load the OAuth2 user from Google
        OAuth2User oauth2User = super.loadUser(userRequest);

        // Get Google ID from the OAuth2 user
        String googleId = oauth2User.getAttribute("sub");

        // Find or create user in database
        User user = userService.findByGoogleId(googleId).orElse(null);

        if (user == null) {
            // New user - will be created by processOAuth2User in success handler
            // For now, assign USER role as default
            Set<GrantedAuthority> authorities = new HashSet<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));

            return new DefaultOAuth2User(authorities, oauth2User.getAttributes(), "sub");
        }

        // Update last login timestamp
        user.setLastLogin(LocalDateTime.now());
        userService.save(user);

        // Build authorities based on user role
        Set<GrantedAuthority> authorities = new HashSet<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));

        log.info("Loaded user ID: {} with role: {}", user.getId(), user.getRole());

        // Return OAuth2User with authorities from database
        return new DefaultOAuth2User(authorities, oauth2User.getAttributes(), "sub");
    }
}
