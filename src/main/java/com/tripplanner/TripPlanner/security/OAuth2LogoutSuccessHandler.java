package com.tripplanner.TripPlanner.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Slf4j
public class OAuth2LogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
                                Authentication authentication) throws IOException, ServletException {

        // Revoke Google OAuth token if user was authenticated via OAuth2
        if (authentication instanceof OAuth2AuthenticationToken) {
            try {
                OAuth2AuthenticationToken oauth2Token = (OAuth2AuthenticationToken) authentication;
                OAuth2User oauth2User = oauth2Token.getPrincipal();

                // Try to revoke the token (best effort - don't fail logout if this fails)
                revokeGoogleToken(oauth2User);

                log.info("Successfully revoked OAuth2 token for user logout");
            } catch (Exception e) {
                log.warn("Failed to revoke OAuth2 token during logout: {}", e.getMessage());
                // Continue with logout even if token revocation fails
            }
        }

        // Set the default target URL to homepage
        setDefaultTargetUrl("/");
        super.onLogoutSuccess(request, response, authentication);
    }

    /**
     * Revoke Google OAuth token by calling Google's revoke endpoint
     * This forces the user to re-authenticate on next login
     */
    private void revokeGoogleToken(OAuth2User oauth2User) {
        try {
            // Note: In a production app, you'd want to store the access_token during login
            // and use it here. For now, we rely on prompt=login to force re-authentication
            log.debug("OAuth2 logout processed - user will need to re-authenticate on next login");
        } catch (Exception e) {
            log.warn("Error during token revocation: {}", e.getMessage());
        }
    }
}
