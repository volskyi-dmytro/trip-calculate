package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.jdbc.Sql;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Sql(
        scripts = "classpath:org/springframework/session/jdbc/schema-h2.sql",
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_CLASS)
class PublicNotFoundSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void unknownPublicGetReturns404WithoutAuthenticationRedirect() throws Exception {
        mockMvc.perform(get("/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void protectedGetStillRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/routes/123"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "http://localhost/oauth2/authorization/google"));
    }

    @Test
    void forwardedWwwHostIsCanonicalizedThroughCompleteFilterChain() throws Exception {
        mockMvc.perform(get("/en")
                        .header(HttpHeaders.HOST, "internal:8080")
                        .header("X-Forwarded-Host", "www.trip-calculate.online")
                        .header("X-Forwarded-Proto", "https"))
                .andExpect(status().isPermanentRedirect())
                .andExpect(header().string(HttpHeaders.LOCATION, "https://trip-calculate.online/en"));
    }
}
