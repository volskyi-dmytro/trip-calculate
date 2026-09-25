package com.tripplanner.TripPlanner.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.actuate.health.Status;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Reports the AI agent as UP or DEGRADED, never DOWN: only the AI chat depends
 * on it, so an agent outage must not mark the whole site unhealthy (Docker and
 * Cloudflare would then treat trip calculation and the planner as down too).
 * DEGRADED is ordered and mapped to HTTP 200 in application.properties.
 */
@Component
public class AgentHealthIndicator implements HealthIndicator {

    static final Status DEGRADED = new Status("DEGRADED", "AI agent unavailable");

    private static final Logger logger = LoggerFactory.getLogger(AgentHealthIndicator.class);

    @Value("${agent.url:}")
    private String agentUrl;

    private final RestTemplate restTemplate;

    public AgentHealthIndicator() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.restTemplate = new RestTemplate(factory);
    }

    @Override
    public Health health() {
        if (agentUrl == null || agentUrl.isEmpty()) {
            return Health.status(DEGRADED)
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
            return Health.status(DEGRADED)
                    .withDetail("status", "DOWN")
                    .build();
        }

        return Health.status(DEGRADED).withDetail("status", "UNHEALTHY").build();
    }
}
