package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.service.AdminDashboardService;
import com.tripplanner.TripPlanner.service.EmailTestService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.user.OAuth2User;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AdminControllerPublicAccessTest {

    @Test
    void obsoleteAccessMutationEndpointsAreGoneAndHaveNoSideEffects() {
        AdminDashboardService admin = mock(AdminDashboardService.class);
        EmailTestService email = mock(EmailTestService.class);
        OAuth2User principal = mock(OAuth2User.class);
        AdminController controller = new AdminController(admin, email);

        assertEquals(HttpStatus.GONE, controller.grantAccess(1L, principal).getStatusCode());
        assertEquals(HttpStatus.GONE, controller.revokeAccess(1L, principal).getStatusCode());
        assertEquals(HttpStatus.GONE, controller.approveAccessRequest(1L, principal).getStatusCode());
        assertEquals(HttpStatus.GONE, controller.denyAccessRequest(1L, principal).getStatusCode());

        verifyNoInteractions(admin, email, principal);
    }
}
