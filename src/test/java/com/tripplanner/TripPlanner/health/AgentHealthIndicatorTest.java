package com.tripplanner.TripPlanner.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Redis isn't running in tests and mail uses fake credentials (prod disables mail
// health too); turn both off so only the agent is judged.
@SpringBootTest(properties = {
        "management.health.redis.enabled=false",
        "management.health.mail.enabled=false",
        "agent.url=http://127.0.0.1:1"})
@AutoConfigureMockMvc
class AgentHealthIndicatorTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void unreachableAgentDegradesInsteadOfTakingTheAppDown() {
        AgentHealthIndicator indicator = new AgentHealthIndicator();
        ReflectionTestUtils.setField(indicator, "agentUrl", "http://127.0.0.1:1");

        assertEquals("DEGRADED", indicator.health().getStatus().getCode());
    }

    @Test
    void appHealthStaysServingWhenOnlyTheAgentIsDown() throws Exception {
        // Docker's healthcheck and Cloudflare only look at the HTTP status.
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DEGRADED"));
    }
}
