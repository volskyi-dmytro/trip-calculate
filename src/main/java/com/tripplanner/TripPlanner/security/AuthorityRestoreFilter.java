package com.tripplanner.TripPlanner.security;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/**
 * Filter that restores Spring Security authorities from database when session is restored.
 *
 * Problem: When Spring Session JDBC restores a session, the DefaultOidcUser authorities
 * are not properly deserialized, resulting in an empty authorities collection.
 *
 * Solution: This filter checks if the current authentication has authorities, and if not,
 * reloads them from the database based on the user's Google ID stored in the OIDC principal.
 *
 * This filter runs on every request but only performs database lookup when authorities are missing.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuthorityRestoreFilter extends OncePerRequestFilter {

    private final UserService userService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // Check if user is authenticated and has OAuth2 authentication
        if (authentication instanceof OAuth2AuthenticationToken oauth2Token) {

            // Check if authorities are missing, empty, or don't contain any ROLE_ authorities
            boolean needsRestore = false;

            if (oauth2Token.getAuthorities() == null || oauth2Token.getAuthorities().isEmpty()) {
                log.info("OAuth2 authentication has null/empty authorities - needs restore");
                needsRestore = true;
            } else {
                // Check if any authority starts with "ROLE_"
                boolean hasRoleAuthority = oauth2Token.getAuthorities().stream()
                        .anyMatch(auth -> auth.getAuthority() != null && auth.getAuthority().startsWith("ROLE_"));

                if (!hasRoleAuthority) {
                    log.info("OAuth2 authentication missing ROLE_ authorities - needs restore. Current authorities: {}",
                            oauth2Token.getAuthorities().stream()
                                    .map(GrantedAuthority::getAuthority)
                                    .toList());
                    needsRestore = true;
                }
            }

            if (needsRestore) {
                // Get the OIDC user from the authentication
                Object principal = oauth2Token.getPrincipal();

                if (principal instanceof OidcUser oidcUser) {
                    // Extract Google ID from OIDC user
                    String googleId = oidcUser.getAttribute("sub");

                    if (googleId != null) {
                        // Load user from database to get their role
                        Optional<User> userOptional = userService.findByGoogleId(googleId);

                        if (userOptional.isPresent()) {
                            User user = userOptional.get();

                            // Build authorities based on user role from database
                            Set<GrantedAuthority> authorities = new HashSet<>();
                            String roleAuthority = "ROLE_" + user.getRole().name();
                            authorities.add(new SimpleGrantedAuthority(roleAuthority));

                            log.info("Restored authority '{}' for user ID: {} (email: {})",
                                    roleAuthority, user.getId(), user.getEmail());

                            // Create new OidcUser with restored authorities
                            DefaultOidcUser newOidcUser = new DefaultOidcUser(
                                    authorities,
                                    oidcUser.getIdToken(),
                                    oidcUser.getUserInfo()
                            );

                            // Create new authentication token with restored authorities
                            OAuth2AuthenticationToken newAuth = new OAuth2AuthenticationToken(
                                    newOidcUser,
                                    authorities,
                                    oauth2Token.getAuthorizedClientRegistrationId()
                            );

                            // Update the security context with the new authentication
                            SecurityContextHolder.getContext().setAuthentication(newAuth);

                            log.info("Successfully updated SecurityContext with restored authorities for request: {} {}",
                                    request.getMethod(), request.getRequestURI());

                        } else {
                            log.warn("User not found in database for Google ID: {} - cannot restore authorities", googleId);
                        }
                    } else {
                        log.warn("Google ID (sub claim) not found in OIDC user attributes - cannot restore authorities");
                    }
                } else {
                    log.warn("Principal is not an OidcUser, actual type: {}",
                            principal != null ? principal.getClass().getName() : "null");
                }
            }
        } else if (authentication != null && authentication.isAuthenticated()) {
            log.debug("Authenticated but not OAuth2: {} with authorities: {}",
                    authentication.getClass().getSimpleName(),
                    authentication.getAuthorities());
        }

        // Continue with the filter chain
        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) throws ServletException {
        // Temporarily disabled optimization to enable full logging for debugging
        // TODO: Re-enable after confirming the filter works correctly
        return false;

        /* Original optimization - restore after testing:
        String path = request.getRequestURI();
        return path.startsWith("/css/") ||
               path.startsWith("/js/") ||
               path.startsWith("/images/") ||
               path.startsWith("/static/") ||
               path.startsWith("/assets/") ||
               path.equals("/calculate") ||
               path.startsWith("/oauth2/") ||
               path.startsWith("/login/");
        */
    }
}
