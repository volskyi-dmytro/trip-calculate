package com.tripplanner.TripPlanner.ai.controller;

import lombok.Data;

/**
 * Inbound JSON body for POST /api/ai/chat from the browser.
 *
 * {@code message} is required. {@code sessionId} is optional; when absent the
 * controller derives a stable per-user default thread id so LangGraph checkpoints
 * can be reused across page reloads (see AgentController).
 */
@Data
public class AgentChatRequest {

    private String message;

    /**
     * Optional LangGraph thread id. When the frontend supplies a value it enables
     * multi-session management (e.g. "trip-123", "trip-456"). When absent the
     * controller falls back to a deterministic per-user default.
     */
    private String sessionId;
}
