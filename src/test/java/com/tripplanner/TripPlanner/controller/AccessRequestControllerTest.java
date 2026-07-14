package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.service.AccessRequestService;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.user.OAuth2User;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AccessRequestControllerTest {

    @Test
    void obsoleteManualAccessMutationsAreGoneAndHaveNoSideEffects() {
        AccessRequestService accessRequests = mock(AccessRequestService.class);
        OAuth2User principal = mock(OAuth2User.class);
        AccessRequestController controller = new AccessRequestController(accessRequests);

        ResponseEntity<Void> request = controller.requestAccess("route_planner", principal);
        ResponseEntity<Void> approve = controller.approveRequest(1L, principal);
        ResponseEntity<Void> reject = controller.rejectRequest(1L, principal);

        assertEquals(410, request.getStatusCode().value());
        assertEquals(410, approve.getStatusCode().value());
        assertEquals(410, reject.getStatusCode().value());
        verifyNoInteractions(accessRequests, principal);
    }
}
