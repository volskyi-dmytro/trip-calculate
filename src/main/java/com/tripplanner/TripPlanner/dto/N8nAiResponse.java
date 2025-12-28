package com.tripplanner.TripPlanner.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Response from N8N AI workflow
 * Includes both extracted parameters (for caching) and AI-generated response
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class N8nAiResponse {

    /**
     * Extracted route parameters (for semantic caching)
     * Will be null if N8N didn't extract parameters (backward compatibility)
     */
    private RouteParameters parameters;

    /**
     * AI-generated response content
     * This is what gets cached and returned to the user
     */
    private String response;

    /**
     * Success flag from N8N
     */
    private Boolean success;

    /**
     * Error message if extraction or generation failed
     */
    private String error;

    /**
     * Check if response is valid
     */
    public boolean isValid() {
        return success != null && success && response != null && !response.trim().isEmpty();
    }

    /**
     * Check if parameters were extracted
     */
    public boolean hasParameters() {
        return parameters != null && parameters.isValid();
    }
}
