package com.tripplanner.TripPlanner.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AgentResponse {
    private Boolean success;
    private Object route;
    private String message;
    private Object stats;
    private String error;

    public boolean isValid() {
        return success != null && success && route != null;
    }
}
