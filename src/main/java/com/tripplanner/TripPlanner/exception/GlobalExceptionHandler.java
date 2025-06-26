package com.tripplanner.TripPlanner.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final Logger securityLogger = LoggerFactory.getLogger("SECURITY");

    // Handle attempts to access protected resources - THIS IS THE KEY ONE!
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<String> handleNoResourceFound(NoResourceFoundException e) {
        String resource = e.getResourcePath();
        String clientIp = getClientIp();

        // Detect security-sensitive paths
        if (isSuspiciousPath(resource)) {
            securityLogger.warn("SECURITY ALERT: Attempted access to sensitive resource '{}' from IP: {}",
                    resource, clientIp);
        } else {
            logger.debug("Resource not found: {} from IP: {}", resource, clientIp);
        }

        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<String> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        logger.debug("Blocked unsupported method: {} from IP: {}", e.getMethod(), getClientIp());
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).build();
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    public ResponseEntity<String> handleNotFound(NoHandlerFoundException e) {
        logger.debug("404 for path: {} from IP: {}", e.getRequestURL(), getClientIp());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleBadRequest(IllegalArgumentException e) {
        String clientIp = getClientIp();

        if (e.getMessage() != null &&
                (e.getMessage().contains("Invalid character found in method name") ||
                        e.getMessage().contains("HTTP method names must be tokens"))) {
            logger.debug("Blocked malformed HTTP request from IP: {}", clientIp);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        logger.warn("Application error from IP {}: {}", clientIp, e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid request");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleGeneral(Exception e) {
        String clientIp = getClientIp();

        if (e.getMessage() != null &&
                (e.getMessage().contains("Error parsing HTTP request") ||
                        e.getMessage().contains("Invalid character found") ||
                        e.getMessage().contains("HTTP method names must be tokens"))) {
            logger.debug("Blocked malicious request from IP: {}", clientIp);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        logger.error("Unexpected error from IP {}: ", clientIp, e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    // Helper method to detect suspicious paths
    private boolean isSuspiciousPath(String resource) {
        if (resource == null) return false;

        String lowerPath = resource.toLowerCase();
        return lowerPath.contains(".git") ||
                lowerPath.contains(".env") ||
                lowerPath.contains("config") ||
                lowerPath.contains(".aws") ||
                lowerPath.contains(".ssh") ||
                lowerPath.contains("backup") ||
                lowerPath.contains("admin") ||
                lowerPath.contains(".htaccess") ||
                lowerPath.contains(".htpasswd") ||
                lowerPath.contains("web.xml") ||
                lowerPath.contains("phpinfo") ||
                lowerPath.endsWith(".bak") ||
                lowerPath.endsWith(".backup") ||
                lowerPath.endsWith(".old");
    }

    // Helper method to get client IP address
    private String getClientIp() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();

                // Check for X-Forwarded-For header (common in reverse proxy setups)
                String xForwardedFor = request.getHeader("X-Forwarded-For");
                if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
                    return xForwardedFor.split(",")[0].trim();
                }

                // Check for X-Real-IP header
                String xRealIp = request.getHeader("X-Real-IP");
                if (xRealIp != null && !xRealIp.isEmpty()) {
                    return xRealIp;
                }

                // Fall back to remote address
                return request.getRemoteAddr();
            }
        } catch (Exception e) {
            logger.debug("Could not determine client IP: {}", e.getMessage());
        }
        return "unknown";
    }
}