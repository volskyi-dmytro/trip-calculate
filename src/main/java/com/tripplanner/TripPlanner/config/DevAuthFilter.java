package com.tripplanner.TripPlanner.config;

import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Dev-profile only (registered from {@link DevSecurityConfig}; DeployedProfileGuard refuses the dev
 * profile in a deployed container). Signs every request in as a seeded local user so route saves,
 * dashboards and browser tests have a real principal. {@code X-Dev-User: <name>} selects a different
 * user, which is how ownership and two-user cases are exercised.
 */
public class DevAuthFilter extends OncePerRequestFilter {

    private static final String DEFAULT_USER = "dev";

    private final UserService userService;
    private final Set<String> seeded = ConcurrentHashMap.newKeySet();

    public DevAuthFilter(UserService userService) {
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current == null || current instanceof AnonymousAuthenticationToken) {
            String header = request.getHeader("X-Dev-User");
            // Restricted to a safe slug: it becomes part of an email address.
            String name = header != null && header.matches("[a-z0-9]{1,20}") ? header : DEFAULT_USER;
            Map<String, Object> attrs = Map.of("sub", "dev-sub-" + name, "email", name + "@localhost", "name", "Dev " + name);
            DefaultOAuth2User principal = new DefaultOAuth2User(List.of(new SimpleGrantedAuthority("ROLE_USER")), attrs, "sub");
            if (seeded.add(name)) userService.processOAuth2User(principal);
            SecurityContextHolder.getContext().setAuthentication(
                    new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google"));
        }
        chain.doFilter(request, response);
    }
}
