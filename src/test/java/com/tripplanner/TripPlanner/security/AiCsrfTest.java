package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AiCsrfTest {

    @Autowired
    private MockMvc mockMvc;

    // The AI filter only accepts a verified Google identity.
    private static RequestPostProcessor googleUser() {
        return oidcLogin().idToken(token -> token
                .subject("g-123")
                .claim("email", "user@example.com")
                .claim("email_verified", true));
    }

    @Test
    void aiRequestWithoutCsrfTokenIsRejected() throws Exception {
        mockMvc.perform(post("/api/ai/insights")
                        .with(googleUser())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Kyiv to Lviv\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void aiRequestWithCsrfTokenPassesTheCsrfCheck() throws Exception {
        int status = mockMvc.perform(post("/api/ai/insights")
                        .with(googleUser())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"Kyiv to Lviv\"}"))
                .andReturn().getResponse().getStatus();
        assertNotEquals(403, status);
    }
}
