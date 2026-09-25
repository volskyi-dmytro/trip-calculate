package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Runs through the real filter chain, including Spring's ForwardedHeaderFilter,
 * which rewrites getRemoteAddr() from X-Forwarded-For.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ClientIpFilterChainTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void spoofedForwardingHeadersCannotSwitchOffRateLimiting() throws Exception {
        int last = 0;
        for (int i = 0; i < 60; i++) {
            last = mockMvc.perform(get("/api/does-not-matter")
                            .header("X-Forwarded-For", "127.0.0.1")
                            .header("CF-Connecting-IP", "127.0.0.1")
                            .with(request -> {
                                request.setRemoteAddr("198.51.100.9");
                                return request;
                            }))
                    .andReturn().getResponse().getStatus();
        }
        assertEquals(429, last);
    }
}
