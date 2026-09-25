package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserDataExportService;
import com.tripplanner.TripPlanner.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserDataExportControllerTest {

    @Test
    void downloadsTheSignedInUsersOwnDataAsAJsonFile() {
        UserService users = mock(UserService.class);
        UserDataExportService exports = mock(UserDataExportService.class);
        User user = new User();
        user.setId(42L);
        when(users.findByGoogleId("google-sub-42")).thenReturn(Optional.of(user));
        when(exports.export(42L)).thenReturn(Map.of("profile", Map.of("email", "user@example.com")));
        var principal = new DefaultOAuth2User(List.of(), Map.of("sub", "google-sub-42"), "sub");

        ResponseEntity<Map<String, Object>> response =
                new UserDataExportController(users, exports).export(principal);

        assertEquals(200, response.getStatusCode().value());
        String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertTrue(disposition.startsWith("attachment; filename=\"trip-calculate-data-"), disposition);
        assertTrue(disposition.endsWith(".json\""), disposition);
        assertEquals("no-store", response.getHeaders().getCacheControl());
    }

    @Test
    void unknownUserGets404() {
        UserService users = mock(UserService.class);
        when(users.findByGoogleId("nobody")).thenReturn(Optional.empty());
        var principal = new DefaultOAuth2User(List.of(), Map.of("sub", "nobody"), "sub");

        assertEquals(404, new UserDataExportController(users, mock(UserDataExportService.class))
                .export(principal).getStatusCode().value());
    }
}
