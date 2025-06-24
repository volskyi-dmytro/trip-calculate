package com.tripplanner.TripPlanner.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.NoHandlerFoundException;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // This handles PROPFIND, unsupported POST, etc.
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<String> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        // Log at DEBUG level to reduce noise - these are mostly bot attacks
        logger.debug("Blocked unsupported method: {} for request", e.getMethod());
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).build();
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<String> handleNotFound(NoHandlerFoundException e) {
        logger.debug("404 for path: {}", e.getRequestURL());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    // Catch malformed HTTP requests (like the SSL attacks)
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleBadRequest(IllegalArgumentException e) {
        // These are usually malformed HTTP method attacks
        if (e.getMessage() != null &&
                (e.getMessage().contains("Invalid character found in method name") ||
                        e.getMessage().contains("HTTP method names must be tokens"))) {
            logger.debug("Blocked malformed HTTP request: {}", e.getMessage().substring(0, Math.min(50, e.getMessage().length())));
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // Real application errors
        logger.warn("Application error: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body("Invalid request");
    }

    // Catch any other weird requests
    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleGeneral(Exception e) {
        // Check if it's a parsing error (common with malicious requests)
        if (e.getMessage() != null &&
                (e.getMessage().contains("Error parsing HTTP request") ||
                        e.getMessage().contains("Invalid character found") ||
                        e.getMessage().contains("HTTP method names must be tokens"))) {
            logger.debug("Blocked malicious request: {}", e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        // Log real errors at ERROR level
        logger.error("Unexpected error: ", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
}