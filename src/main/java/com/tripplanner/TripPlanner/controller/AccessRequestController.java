package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import com.tripplanner.TripPlanner.service.AccessRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/access-requests")
@RequiredArgsConstructor
public class AccessRequestController {
    private final AccessRequestService accessRequestService;

    @PostMapping
    public ResponseEntity<Void> requestAccess(
            @RequestParam String featureName,
            @AuthenticationPrincipal OAuth2User principal) {
        return ResponseEntity.status(HttpStatus.GONE).build();
    }

    @GetMapping("/pending")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<AccessRequest>> getPendingRequests() {
        return ResponseEntity.ok(accessRequestService.getPendingRequests());
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> approveRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        return ResponseEntity.status(HttpStatus.GONE).build();
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> rejectRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User principal) {
        return ResponseEntity.status(HttpStatus.GONE).build();
    }
}
