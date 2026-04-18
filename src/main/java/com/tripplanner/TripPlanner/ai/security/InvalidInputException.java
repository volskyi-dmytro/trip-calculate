package com.tripplanner.TripPlanner.ai.security;

/**
 * Thrown by {@link PromptInjectionFilter#sanitize(String)} when the input
 * violates any of the prompt-injection defence rules.
 */
public class InvalidInputException extends Exception {

    public InvalidInputException(String message) {
        super(message);
    }
}
