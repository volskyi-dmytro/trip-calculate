package com.tripplanner.TripPlanner.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class AgentHealthIndicator implements HealthIndicator {

    private static final Logger logger = LoggerFactory.getLogger(AgentHealthIndicator.class);

    @Value("${agent.url:}")
    private String agentUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    public Health health() {
        if (agentUrl == null || agentUrl.isEmpty()) {
            return Health.down()
                    .withDetail("status", "NOT_CONFIGURED")
                    .withDetail("message", "AGENT_URL environment variable is not set")
                    .build();
        }

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(agentUrl + "/health", String.class);
            if (response.getStatusCode().is2xxSuccessful()) {
                return Health.up()
                        .withDetail("status", "UP")
                        .withDetail("url", agentUrl.replaceAll("(https?://[^/]+).*", "$1/***"))
                        .build();
            }
        } catch (Exception e) {
            logger.warn("Agent health check failed: {}", e.getMessage());
            return Health.down()
                    .withDetail("status", "DOWN")
                    .withDetail("error", e.getMessage())
                    .build();
        }

        return Health.down().withDetail("status", "UNHEALTHY").build();
    }
}
