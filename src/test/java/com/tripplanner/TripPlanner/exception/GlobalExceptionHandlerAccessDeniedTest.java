package com.tripplanner.TripPlanner.exception;

import com.tripplanner.TripPlanner.controller.AdminController;
import com.tripplanner.TripPlanner.service.AdminDashboardService;
import com.tripplanner.TripPlanner.service.EmailTestService;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * QA F5: @PreAuthorize denials surface as AccessDeniedException from the controller
 * layer; the Exception catch-all used to turn them into an empty 500.
 */
class GlobalExceptionHandlerAccessDeniedTest {

    @Test
    void accessDeniedFromMethodSecurityIs403NotAn500() throws Exception {
        AdminDashboardService admin = mock(AdminDashboardService.class);
        when(admin.getSystemStats()).thenThrow(new AccessDeniedException("Access Denied"));
        when(admin.getAllUsers()).thenThrow(new AccessDeniedException("Access Denied"));
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new AdminController(admin, mock(EmailTestService.class)))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mvc.perform(get("/api/admin/stats")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users")).andExpect(status().isForbidden());
    }
}
