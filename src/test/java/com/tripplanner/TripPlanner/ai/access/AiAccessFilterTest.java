package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Unit tests for AiAccessFilter using plain Mockito (no Spring context).
 *
 * Verifies the 403/200/429 matrix required by CLAUDE.md:
 *  - unauthenticated → 401
 *  - authenticated, NO_GRANT → 403
 *  - authenticated, GRANTED → filter passes, aiUserId attribute set
 *  - authenticated, OVER_CAP → 429 with Retry-After
 *  - authenticated, RATE_LIMITED → 429
 */
@ExtendWith(MockitoExtension.class)
class AiAccessFilterTest {

    @Mock
    private AiAccessService aiAccessService;

    private AiAccessFilter filter;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        filter = new AiAccessFilter(aiAccessService, objectMapper);
        SecurityContextHolder.clearContext();
    }

    // -------------------------------------------------------------------------
    // Unauthenticated
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Unauthenticated request to /api/ai/ping → 401")
    void unauthenticated_returns401() throws Exception {
        // No authentication in SecurityContext
        MockHttpServletRequest request = buildRequest("GET", "/api/ai/ping");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilterInternal(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("unauthenticated");
        // Filter chain must NOT have been called
        assertThat(chain.getRequest()).isNull();
    }

    // -------------------------------------------------------------------------
    // NO_GRANT
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Authenticated, AiAccessService returns NO_GRANT → 403")
    void noGrant_returns403() throws Exception {
        authenticateAs("google-sub-123");
        when(aiAccessService.check(anyString(), anyString())).thenReturn(AccessResult.NO_GRANT);

        MockHttpServletRequest request = buildRequest("GET", "/api/ai/ping");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilterInternal(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("no_grant");
        assertThat(chain.getRequest()).isNull();
    }

    // -------------------------------------------------------------------------
    // GRANTED
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Authenticated, AiAccessService returns GRANTED → 200 with aiUserId attribute set")
    void granted_proceedsWithAttribute() throws Exception {
        String userId = "google-sub-456";
        authenticateAs(userId);
        when(aiAccessService.check(anyString(), anyString())).thenReturn(AccessResult.GRANTED);

        MockHttpServletRequest request = buildRequest("GET", "/api/ai/ping");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilterInternal(request, response, chain);

        // Filter chain was called (response is still 200 default)
        assertThat(chain.getRequest()).isNotNull();
        // aiUserId attribute must be set on the request
        assertThat(request.getAttribute(AiAccessFilter.AI_USER_ID_ATTRIBUTE)).isEqualTo(userId);
    }

    // -------------------------------------------------------------------------
    // OVER_CAP
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Authenticated, AiAccessService returns OVER_CAP → 429 with Retry-After")
    void overCap_returns429WithRetryAfter() throws Exception {
        authenticateAs("google-sub-789");
        when(aiAccessService.check(anyString(), anyString())).thenReturn(AccessResult.OVER_CAP);

        MockHttpServletRequest request = buildRequest("GET", "/api/ai/chat");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilterInternal(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isNotNull();
        assertThat(response.getContentAsString()).contains("over_cap");
        assertThat(chain.getRequest()).isNull();
    }

    // -------------------------------------------------------------------------
    // RATE_LIMITED
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Authenticated, AiAccessService returns RATE_LIMITED → 429")
    void rateLimited_returns429() throws Exception {
        authenticateAs("google-sub-000");
        when(aiAccessService.check(anyString(), anyString())).thenReturn(AccessResult.RATE_LIMITED);

        MockHttpServletRequest request = buildRequest("GET", "/api/ai/chat");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilterInternal(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentAsString()).contains("rate_limited");
        assertThat(chain.getRequest()).isNull();
    }

    // -------------------------------------------------------------------------
    // shouldNotFilter
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("Request to non-AI path is skipped by shouldNotFilter")
    void nonAiPath_shouldNotFilter_returnsTrue() throws Exception {
        MockHttpServletRequest request = buildRequest("GET", "/api/user/me");
        assertThat(filter.shouldNotFilter(request)).isTrue();
    }

    @Test
    @DisplayName("Request to /api/ai/** is NOT skipped by shouldNotFilter")
    void aiPath_shouldNotFilter_returnsFalse() throws Exception {
        MockHttpServletRequest request = buildRequest("GET", "/api/ai/ping");
        assertThat(filter.shouldNotFilter(request)).isFalse();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private MockHttpServletRequest buildRequest(String method, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr("127.0.0.1");
        return request;
    }

    private void authenticateAs(String sub) {
        OAuth2User principal = new DefaultOAuth2User(
                Collections.emptyList(),
                Map.of("sub", sub, "email", sub + "@example.com"),
                "sub");

        Authentication auth = new UsernamePasswordAuthenticationToken(
                principal, null, Collections.emptyList());

        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
