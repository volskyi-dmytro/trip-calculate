package com.tripplanner.TripPlanner.filter;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RateLimitingFilterTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static int lastStatus(RateLimitingFilter filter, String peer, String header, String value, int requests)
            throws Exception {
        int status = 0;
        for (int i = 0; i < requests; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/city-routes");
            request.setRemoteAddr(peer);
            if (header != null) request.addHeader(header, value);
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, new MockFilterChain());
            status = response.getStatus();
        }
        return status;
    }

    @Test
    void spoofedLocalhostHeaderNoLongerSwitchesRateLimitingOff() throws Exception {
        RateLimitingFilter filter = new RateLimitingFilter();

        assertEquals(429, lastStatus(filter, "198.51.100.9", "X-Forwarded-For", "127.0.0.1", 60));
        assertEquals(429, lastStatus(new RateLimitingFilter(), "198.51.100.9", "CF-Connecting-IP", "127.0.0.1", 60));
    }

    @Test
    void visitorsBehindCloudflareGetTheirOwnBuckets() throws Exception {
        RateLimitingFilter filter = new RateLimitingFilter();

        assertEquals(429, lastStatus(filter, "162.158.1.20", "CF-Connecting-IP", "203.0.113.7", 60));
        // A different visitor arriving through the same Cloudflare edge is not blocked.
        assertEquals(200, lastStatus(filter, "162.158.1.20", "CF-Connecting-IP", "203.0.113.8", 1));
    }

    @Test
    void realLocalRequestsStillBypass() throws Exception {
        assertEquals(200, lastStatus(new RateLimitingFilter(), "127.0.0.1", null, null, 60));
    }
}
