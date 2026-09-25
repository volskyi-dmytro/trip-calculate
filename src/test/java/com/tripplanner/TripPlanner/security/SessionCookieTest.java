package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SessionCookieTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void anonymousCurrentUserCheckDoesNotStartASession() throws Exception {
        mockMvc.perform(get("/api/user/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false))
                .andExpect(cookie().doesNotExist("SESSIONID"));
    }

    @Test
    void logoutExpiresTheSessionCookieTheAppActuallyUses() throws Exception {
        mockMvc.perform(post("/logout").with(csrf()))
                .andExpect(cookie().maxAge("SESSIONID", 0));
    }
}
