package com.tripplanner.TripPlanner.security;

import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import java.util.List;

import static org.mockito.Mockito.*;

class AuthorityRestoreFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aiRequestsSkipDatabaseBackedAuthorityRestoration() throws Exception {
        UserService userService = mock(UserService.class);
        AuthorityRestoreFilter filter = new AuthorityRestoreFilter(userService);
        OidcUser principal = mock(OidcUser.class);
        when(principal.getAttribute("sub")).thenReturn("google-subject");
        SecurityContextHolder.getContext().setAuthentication(new OAuth2AuthenticationToken(
                principal,
                List.of(new SimpleGrantedAuthority("OIDC_USER")),
                "google"));
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/stream");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verifyNoInteractions(userService);
        verify(chain).doFilter(request, response);
    }
}
