package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.CreateReceiptRequest;
import com.tripplanner.TripPlanner.filter.ReceiptCreationRateLimiter;
import com.tripplanner.TripPlanner.service.ReceiptService;
import com.tripplanner.TripPlanner.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

/**
 * Guards the controller's two auth boundaries: the anonymous rate limit
 * on creation, and the login requirement on list/delete.
 */
class ReceiptControllerTest {

    private ReceiptService receiptService;
    private ReceiptCreationRateLimiter rateLimiter;
    private ReceiptController controller;

    @BeforeEach
    void setUp() {
        receiptService = mock(ReceiptService.class);
        rateLimiter = mock(ReceiptCreationRateLimiter.class);
        controller = new ReceiptController(receiptService, rateLimiter, mock(UserService.class));
    }

    @Test
    void createReturns429WhenRateLimited() {
        when(rateLimiter.tryAcquire(anyString(), anyBoolean())).thenReturn(false);

        ResponseEntity<?> response = controller.createReceipt(
                new CreateReceiptRequest(), null, new MockHttpServletRequest());

        assertEquals(429, response.getStatusCode().value());
        verify(receiptService, never()).create(any(), any());
    }

    @Test
    void createPassesNullUserIdForAnonymous() {
        when(rateLimiter.tryAcquire(anyString(), anyBoolean())).thenReturn(true);

        controller.createReceipt(new CreateReceiptRequest(), null, new MockHttpServletRequest());

        verify(receiptService).create(any(CreateReceiptRequest.class), isNull());
    }

    @Test
    void listRequiresAuthentication() {
        ResponseEntity<?> response = controller.listMyReceipts(null);
        assertEquals(401, response.getStatusCode().value());
    }

    @Test
    void deleteRequiresAuthentication() {
        ResponseEntity<?> response = controller.deleteReceipt("abc12345", null);
        assertEquals(401, response.getStatusCode().value());
        verify(receiptService, never()).delete(anyString(), any());
    }
}
