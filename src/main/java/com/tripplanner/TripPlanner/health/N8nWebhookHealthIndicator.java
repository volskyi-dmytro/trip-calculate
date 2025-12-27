package com.tripplanner.TripPlanner.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Health indicator for N8N webhook availability
 * Checks if the N8N webhook is configured
 */
@Component
public class N8nWebhookHealthIndicator implements HealthIndicator {

    private static final Logger logger = LoggerFactory.getLogger(N8nWebhookHealthIndicator.class);

    @Value("${n8n.webhook.url:}")
    private String n8nWebhookUrl;

    @Override
    public Health health() {
        Map<String, Object> details = new HashMap<>();

        // Check if webhook URL is configured
        if (n8nWebhookUrl == null || n8nWebhookUrl.isEmpty()) {
            details.put("status", "NOT_CONFIGURED");
            details.put("message", "N8N webhook URL is not set");
            details.put("impact", "AI insights feature is disabled");
            details.put("action", "Set N8N_WEBHOOK_URL environment variable to enable AI insights");

            // Return DOWN for health check since feature is not configured
            return Health.down()
                    .withDetails(details)
                    .build();
        }

        // Mask URL for security (show domain but hide path)
        String maskedUrl = n8nWebhookUrl.replaceAll("(https?://[^/]+).*", "$1/***");

        // Extract path structure (without exposing domain)
        String pathOnly = "/";
        try {
            String afterProtocol = n8nWebhookUrl.substring(n8nWebhookUrl.indexOf("://") + 3);
            pathOnly = afterProtocol.contains("/") ? afterProtocol.substring(afterProtocol.indexOf("/")) : "/";
        } catch (Exception ex) {
            logger.debug("Could not extract path from URL", ex);
        }

        details.put("status", "CONFIGURED");
        details.put("webhookUrl", maskedUrl);
        details.put("webhookPath", pathOnly);
        details.put("message", "N8N webhook is configured");
        details.put("note", "Connectivity check skipped to avoid triggering workflow. Check application logs for actual webhook call results.");

        // Return UP status - the application is healthy if webhook is configured
        // Actual connectivity will be validated when the endpoint is used
        return Health.up()
                .withDetails(details)
                .build();
    }
}
