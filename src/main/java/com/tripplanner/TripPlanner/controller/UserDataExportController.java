package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.UserDataExportService;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

/** "Download my data" (data portability): the signed-in user's own data as a JSON file. */
@RestController
@RequiredArgsConstructor
public class UserDataExportController {

    private final UserService userService;
    private final UserDataExportService exportService;

    @GetMapping("/api/user/dashboard/export")
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal OAuth2User principal) {
        Optional<User> user = principal == null ? Optional.empty()
                : userService.findByGoogleId(principal.getAttribute("sub"));
        if (user.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        String filename = "trip-calculate-data-" + LocalDate.now() + ".json";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                // Personal data: never cache it in a browser or proxy.
                .cacheControl(CacheControl.noStore())
                .body(exportService.export(user.get().getId()));
    }
}
