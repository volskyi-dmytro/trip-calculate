package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.AccessRequestService;
import com.tripplanner.TripPlanner.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/access-requests")
@RequiredArgsConstructor
public class AccessRequestController {
    private final AccessRequestService accessRequestService;
    private final UserService userService;

    @PostMapping
    public ResponseEntity<Void> requestAccess(
            @RequestParam String featureName,
            @AuthenticationPrincipal OAuth2User principal) {
        Long userId = getUserId(principal);
        String email = principal.getAttribute("email");
        String name = principal.getAttribute("name");

        accessRequestService.requestAccess(userId, featureName, email, name);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/pending")
    public ResponseEntity<List<AccessRequest>> getPendingRequests() {
        // TODO: Add admin authorization check
        return ResponseEntity.ok(accessRequestService.getPendingRequests());
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<Void> approveRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        // TODO: Add admin authorization check
        String approvedBy = principal.getAttribute("name");
        accessRequestService.approveRequest(id, approvedBy);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<Void> rejectRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        // TODO: Add admin authorization check
        String rejectedBy = principal.getAttribute("name");
        accessRequestService.rejectRequest(id, rejectedBy);
        return ResponseEntity.ok().build();
    }

    private Long getUserId(OAuth2User principal) {
        String googleId = principal.getAttribute("sub");
        User user = userService.findByGoogleId(googleId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return user.getId();
    }
}
