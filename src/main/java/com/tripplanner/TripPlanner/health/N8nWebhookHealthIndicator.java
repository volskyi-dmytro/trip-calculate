package com.tripplanner.TripPlanner.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Health indicator for N8N webhook availability
 * Checks if the N8N webhook is configured and reachable
 */
@Component
public class N8nWebhookHealthIndicator implements HealthIndicator {

    private static final Logger logger = LoggerFactory.getLogger(N8nWebhookHealthIndicator.class);

    @Value("${n8n.webhook.url:}")
    private String n8nWebhookUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    public Health health() {
        Map<String, Object> details = new HashMap<>();

        // Check if webhook URL is configured
        if (n8nWebhookUrl == null || n8nWebhookUrl.isEmpty()) {
            details.put("status", "NOT_CONFIGURED");
            details.put("message", "N8N webhook URL is not set");
            details.put("impact", "AI insights feature is disabled");
            return Health.down()
                    .withDetails(details)
                    .build();
        }

        // Mask URL for security
        String maskedUrl = n8nWebhookUrl.replaceAll("(https?://[^/]+).*", "$1/***");
        details.put("webhookUrl", maskedUrl);

        // Try to ping the webhook (OPTIONS or HEAD request)
        // Note: We don't actually call it with POST as that would trigger the workflow
        try {
            ResponseEntity<String> response = restTemplate.optionsForAllow(n8nWebhookUrl);

            details.put("status", "CONFIGURED");
            details.put("reachable", "UNKNOWN");
            details.put("message", "N8N webhook is configured. Actual availability check skipped to avoid triggering workflow.");
            details.put("note", "If you see 404 errors when using AI insights, the N8N workflow may not be activated.");

            return Health.up()
                    .withDetails(details)
                    .build();

        } catch (Exception e) {
            details.put("status", "CONFIGURED_BUT_UNREACHABLE");
            details.put("error", e.getMessage());
            details.put("message", "N8N webhook URL is configured but may not be reachable");
            details.put("recommendation", "Check if N8N workflow is activated in production mode");

            logger.debug("N8N webhook health check failed (this is informational only): {}", e.getMessage());

            // Return UP status because we don't want to fail health checks just because N8N is down
            // The application itself is healthy
            return Health.up()
                    .withDetails(details)
                    .build();
        }
    }
}
