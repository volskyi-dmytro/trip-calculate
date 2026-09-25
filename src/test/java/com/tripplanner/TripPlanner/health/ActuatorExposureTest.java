package com.tripplanner.TripPlanner.health;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** Only the health endpoint may ever be reachable; the rest must stay switched off. */
@SpringBootTest(properties = {
        "management.health.redis.enabled=false",
        "management.health.mail.enabled=false"})
@AutoConfigureMockMvc
class ActuatorExposureTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthAnswers() throws Exception {
        int status = mockMvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus();
        assertTrue(status == 200 || status == 503, "health status " + status);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/actuator/env", "/actuator/beans", "/actuator/info", "/actuator/prometheus",
            "/actuator/heapdump", "/actuator/configprops", "/actuator/mappings", "/actuator/loggers"})
    void everyOtherEndpointStaysOff(String path) throws Exception {
        String body = mockMvc.perform(get(path)).andReturn().getResponse().getContentAsString();
        int status = mockMvc.perform(get(path)).andReturn().getResponse().getStatus();
        assertNotEquals(200, status, path + " answered: " + body.substring(0, Math.min(120, body.length())));
    }
}
