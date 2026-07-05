package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.CreateReceiptRequest;
import com.tripplanner.TripPlanner.dto.ReceiptDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.filter.ReceiptCreationRateLimiter;
import com.tripplanner.TripPlanner.service.ReceiptService;
import com.tripplanner.TripPlanner.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Public receipt API. Creation is open to anonymous users (the viral loop
 * depends on it) but guarded by ReceiptCreationRateLimiter; list/delete
 * are owner-only.
 */
@RestController
@RequestMapping("/api/receipts")
@RequiredArgsConstructor
public class ReceiptController {

    private final ReceiptService receiptService;
    private final ReceiptCreationRateLimiter rateLimiter;
    private final UserService userService;

    @PostMapping
    public ResponseEntity<?> createReceipt(@RequestBody CreateReceiptRequest request,
                                           @AuthenticationPrincipal OAuth2User principal,
                                           HttpServletRequest httpRequest) {
        Long userId = resolveUserId(principal);
        if (!rateLimiter.tryAcquire(clientIp(httpRequest), userId != null)) {
            return ResponseEntity.status(429)
                    .body(Map.of("error", "Too many receipts created. Try again later."));
        }
        return ResponseEntity.ok(receiptService.create(request, userId));
    }

    @GetMapping("/{slug}")
    public ResponseEntity<ReceiptDTO> getReceipt(@PathVariable String slug) {
        return ResponseEntity.ok(receiptService.getBySlug(slug));
    }

    @PostMapping("/{slug}/cta")
    public ResponseEntity<Void> registerCta(@PathVariable String slug) {
        receiptService.registerCtaClick(slug);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<?> listMyReceipts(@AuthenticationPrincipal OAuth2User principal) {
        Long userId = resolveUserId(principal);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Login required"));
        }
        return ResponseEntity.ok(receiptService.listForUser(userId));
    }

    @DeleteMapping("/{slug}")
    public ResponseEntity<?> deleteReceipt(@PathVariable String slug,
                                           @AuthenticationPrincipal OAuth2User principal) {
        Long userId = resolveUserId(principal);
        if (userId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Login required"));
        }
        receiptService.delete(slug, userId);
        return ResponseEntity.noContent().build();
    }

    /** Null for anonymous visitors — unlike RouteController, anonymous is a supported state here. */
    private Long resolveUserId(OAuth2User principal) {
        if (principal == null) return null;
        String googleId = principal.getAttribute("sub");
        if (googleId == null) return null;
        return userService.findByGoogleId(googleId).map(User::getId).orElse(null);
    }

    // Same X-Forwarded-For handling as RateLimitingFilter (app runs behind Cloudflare + proxy)
    private String clientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
