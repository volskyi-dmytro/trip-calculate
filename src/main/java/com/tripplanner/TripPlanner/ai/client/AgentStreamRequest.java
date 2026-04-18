package com.tripplanner.TripPlanner.ai.client;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

/**
 * Outbound JSON body for POST /api/agent/stream on the Python langgraph-agent service.
 *
 * Contract matches the Python Pydantic model {@code AgentChatRequest} (agent/app.py).
 * User identity is carried in the {@code X-Internal-Token} JWT's {@code sub} claim —
 * never duplicated in the body.
 *
 * Fields:
 *  - message  — sanitised user input (already through PromptInjectionFilter at the
 *               AgentController layer; M3)
 *  - threadId — LangGraph checkpoint key; enables multi-turn conversations. Serialised
 *               as {@code thread_id} to match the Python model.
 */
@Data
@Builder
public class AgentStreamRequest {

    private String message;

    @JsonProperty("thread_id")
    private String threadId;
}
