package com.tripplanner.TripPlanner.exception;

/**
 * Exception thrown when a user attempts to submit a duplicate access request
 * for a feature they have already requested access to.
 */
public class DuplicateAccessRequestException extends RuntimeException {
    public DuplicateAccessRequestException(String message) {
        super(message);
    }
}
