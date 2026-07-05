package com.tripplanner.TripPlanner.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards against the catch-all Exception.class handler swallowing
 * ResponseStatusException (thrown by ReceiptService et al.) and turning
 * intentional 400/404/410 responses into 500s.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void preservesStatusAndReasonWhenPresent() {
        ResponseEntity<String> response =
                handler.handleResponseStatus(new ResponseStatusException(HttpStatus.GONE, "Receipt expired"));

        assertEquals(410, response.getStatusCode().value());
        assertEquals("Receipt expired", response.getBody());
    }

    @Test
    void fallsBackToGenericMessageWhenReasonIsNull() {
        ResponseEntity<String> response =
                handler.handleResponseStatus(new ResponseStatusException(HttpStatus.NOT_FOUND, null));

        assertEquals(404, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertTrue(!response.getBody().isBlank());
    }
}
