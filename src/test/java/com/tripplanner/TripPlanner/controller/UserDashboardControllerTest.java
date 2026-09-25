package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserDashboardService;
import com.tripplanner.TripPlanner.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserDashboardControllerTest {

    private final UserDashboardService dashboardService = mock(UserDashboardService.class);
    private final UserService userService = mock(UserService.class);
    private final UserDashboardController controller = new UserDashboardController(dashboardService, userService);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void deletingTheAccountEndsTheSession() {
        OAuth2User principal = new DefaultOAuth2User(List.of(), Map.of("sub", "g-123"), "sub");
        Authentication auth = new TestingAuthenticationToken(principal, null, "ROLE_USER");
        SecurityContextHolder.getContext().setAuthentication(auth);
        User user = new User();
        user.setId(42L);
        when(userService.findByGoogleId("g-123")).thenReturn(Optional.of(user));
        MockHttpSession session = new MockHttpSession();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(session);

        var response = controller.deleteAccount(principal, request, new MockHttpServletResponse());

        assertEquals(204, response.getStatusCode().value());
        verify(dashboardService).deleteUserAccount(42L);
        assertTrue(session.isInvalid(), "session must not outlive the account");
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }
}
