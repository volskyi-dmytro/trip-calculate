package com.tripplanner.TripPlanner.security;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/**
 * Custom OIDC UserService for Google OAuth2 login
 * Loads user roles from database and grants Spring Security authorities
 */
@Service
@Slf4j
public class CustomOidcUserService extends OidcUserService {

    private final UserService userService;

    public CustomOidcUserService(UserService userService) {
        this.userService = userService;
        log.info("========================================");
        log.info("CustomOidcUserService BEAN CREATED");
        log.info("========================================");
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        log.info("CustomOidcUserService.loadUser() called - Loading OIDC user from Google");

        // Load the OIDC user from Google
        OidcUser oidcUser = super.loadUser(userRequest);

        // Get Google ID from the OIDC user
        String googleId = oidcUser.getAttribute("sub");
        log.info("OIDC user loaded - Google ID: {}", googleId);

        // Find user in database
        User user = userService.findByGoogleId(googleId).orElse(null);

        if (user == null) {
            log.warn("User not found in database for Google ID: {}. Assigning default ROLE_USER", googleId);
            // New user - will be created by processOAuth2User in success handler
            // For now, assign USER role as default
            Set<GrantedAuthority> authorities = new HashSet<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));

            return new DefaultOidcUser(authorities, oidcUser.getIdToken(), oidcUser.getUserInfo());
        }

        log.info("Found user in database - ID: {}, email: {}, role: {}", user.getId(), user.getEmail(), user.getRole());

        // Update last login timestamp
        user.setLastLogin(LocalDateTime.now());
        userService.save(user);

        // Build authorities based on user role from database
        Set<GrantedAuthority> authorities = new HashSet<>();
        String roleAuthority = "ROLE_" + user.getRole().name();
        authorities.add(new SimpleGrantedAuthority(roleAuthority));

        log.info("Granting authority '{}' to user ID: {}", roleAuthority, user.getId());

        // Return OidcUser with authorities from database
        return new DefaultOidcUser(authorities, oidcUser.getIdToken(), oidcUser.getUserInfo());
    }
}
