package com.tripplanner.TripPlanner.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2LogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    private final OAuth2AuthorizedClientService authorizedClientService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
                                Authentication authentication) throws IOException, ServletException {

        // Revoke Google OAuth token if user was authenticated via OAuth2
        if (authentication instanceof OAuth2AuthenticationToken) {
            try {
                OAuth2AuthenticationToken oauth2Token = (OAuth2AuthenticationToken) authentication;
                String principalName = oauth2Token.getName();
                String registrationId = oauth2Token.getAuthorizedClientRegistrationId();

                log.info("Processing OAuth2 logout for user: {} with registrationId: {}", principalName, registrationId);

                // Get the authorized client to access the token
                OAuth2AuthorizedClient authorizedClient = authorizedClientService
                        .loadAuthorizedClient(registrationId, principalName);

                if (authorizedClient != null) {
                    OAuth2AccessToken accessToken = authorizedClient.getAccessToken();
                    if (accessToken != null) {
                        log.info("Found access token, attempting revocation with Google");
                        // Revoke the token with Google
                        revokeGoogleToken(accessToken.getTokenValue());
                        log.info("Successfully revoked OAuth2 access token for user: {}", principalName);
                    } else {
                        log.warn("No access token found for user: {}", principalName);
                    }

                    // Also try to revoke refresh token if available
                    if (authorizedClient.getRefreshToken() != null) {
                        log.info("Found refresh token, attempting revocation");
                        revokeGoogleToken(authorizedClient.getRefreshToken().getTokenValue());
                        log.info("Successfully revoked OAuth2 refresh token");
                    }
                } else {
                    log.warn("No authorized client found for user: {} with registrationId: {}", principalName, registrationId);
                }

                // Remove the authorized client from the service
                authorizedClientService.removeAuthorizedClient(registrationId, principalName);
                log.info("Removed authorized client from service for user: {}", principalName);

            } catch (Exception e) {
                log.error("Failed to revoke OAuth2 token during logout", e);
                // Continue with logout even if token revocation fails
            }
        } else {
            log.info("No OAuth2 authentication found, proceeding with standard logout");
        }

        // Set the default target URL to homepage
        setDefaultTargetUrl("/");
        super.onLogoutSuccess(request, response, authentication);
    }

    /**
     * Revoke Google OAuth token by calling Google's revoke endpoint
     * This forces complete logout from Google OAuth
     */
    private void revokeGoogleToken(String accessToken) {
        try {
            String revokeUrl = "https://oauth2.googleapis.com/revoke";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("token", accessToken);

            HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

            restTemplate.postForEntity(revokeUrl, request, String.class);
            log.debug("OAuth2 token revoked successfully at Google");

        } catch (Exception e) {
            log.warn("Error revoking token with Google: {}", e.getMessage());
            // Don't fail logout if revocation fails
        }
    }
}
