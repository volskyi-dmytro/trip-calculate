package com.tripplanner.TripPlanner.security;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserService userService;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();

        // Process and save/update user in database
        User user = userService.processOAuth2User(oauth2User);

        // Store user information in session
        request.getSession().setAttribute("userId", user.getId());
        request.getSession().setAttribute("userEmail", user.getEmail());
        request.getSession().setAttribute("userName", user.getName());
        request.getSession().setAttribute("userPicture", user.getPictureUrl());

        // Store OAuth2 token information for revocation on logout
        if (authentication instanceof OAuth2AuthenticationToken) {
            OAuth2AuthenticationToken oauth2Token = (OAuth2AuthenticationToken) authentication;
            // Store the registration ID to help with token management
            request.getSession().setAttribute("oauth2RegistrationId", oauth2Token.getAuthorizedClientRegistrationId());
            log.debug("Stored OAuth2 registration ID for token revocation: {}", oauth2Token.getAuthorizedClientRegistrationId());
        }

        log.info("OAuth2 login successful for user: {} (ID: {})", user.getEmail(), user.getId());

        // Redirect to home page after successful authentication
        setDefaultTargetUrl("/");
        super.onAuthenticationSuccess(request, response, authentication);
    }
}
