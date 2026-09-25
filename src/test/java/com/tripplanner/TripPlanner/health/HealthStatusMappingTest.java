package com.tripplanner.TripPlanner.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Setting any custom health http-mapping replaces Spring Boot's defaults, so this
 * guards that a real outage still answers 503 (Docker and Cloudflare rely on it).
 */
@SpringBootTest(properties = {
        "management.health.redis.enabled=false",
        "management.health.mail.enabled=false"})
@AutoConfigureMockMvc
class HealthStatusMappingTest {

    @TestConfiguration
    static class BrokenDependency {
        @Bean
        HealthIndicator brokenDatabase() {
            return () -> Health.down().build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Test
    void aRealOutageStillAnswers503() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.status").value("DOWN"));
    }
}
