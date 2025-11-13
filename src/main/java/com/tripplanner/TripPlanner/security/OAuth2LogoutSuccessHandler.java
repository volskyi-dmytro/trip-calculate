package com.tripplanner.TripPlanner.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Custom logout handler for OAuth2 authentication
 *
 * Note: We rely on prompt=login&max_age=0 OAuth parameters to force
 * password re-entry on next login. Token revocation is not implemented
 * as Spring Security doesn't automatically persist OAuth tokens to a
 * retrievable store by default.
 */
@Component
@Slf4j
public class OAuth2LogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
                                Authentication authentication) throws IOException, ServletException {

        if (authentication instanceof OAuth2AuthenticationToken) {
            // Get user ID from session if available
            Long userId = (Long) request.getSession().getAttribute("userId");

            if (userId != null) {
                log.info("OAuth2 logout successful for user ID: {}", userId);
            } else {
                log.info("OAuth2 logout successful");
            }
            log.info("User will be required to re-authenticate on next login due to prompt=login&max_age=0");
        } else {
            log.info("Standard logout completed");
        }

        // Clear session and redirect to homepage
        setDefaultTargetUrl("/");
        super.onLogoutSuccess(request, response, authentication);
    }
}
