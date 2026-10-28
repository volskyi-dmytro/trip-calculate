package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.filter.ReceiptOgRateLimiter;
import com.tripplanner.TripPlanner.security.ClientIpResolver;
import com.tripplanner.TripPlanner.service.ReceiptOgRenderer;
import com.tripplanner.TripPlanner.service.ReceiptService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

@Controller
public class ReceiptOgController {
    private final ReceiptService receipts;
    private final ReceiptOgRenderer renderer;
    private final ReceiptOgRateLimiter limiter;
    private final ClientIpResolver clientIps = new ClientIpResolver();
    private final Map<String, byte[]> cache = new LinkedHashMap<>(32, .75f, true);
    private final ReentrantLock renderLock = new ReentrantLock();

    public ReceiptOgController(ReceiptService receipts, ReceiptOgRenderer renderer, ReceiptOgRateLimiter limiter) {
        this.receipts = receipts;
        this.renderer = renderer;
        this.limiter = limiter;
    }

    @GetMapping(value = "/r/{slug}/og.png", produces = "image/png")
    public ResponseEntity<byte[]> image(@PathVariable String slug, HttpServletRequest request) throws IOException {
        if (!slug.matches("[A-Za-z0-9]{8}")) return missing();
        if (!limiter.tryAcquire(clientIps.resolve(request))) return retry(429, "60");
        // Recheck before every cache hit: deletion and expiry must stop origin access.
        var receipt = receipts.findForPreview(slug);
        if (receipt.isEmpty()) {
            synchronized (cache) { cache.remove(slug); }
            return missing();
        }
        byte[] png;
        synchronized (cache) { png = cache.get(slug); }
        if (png == null) {
            // Never queue concurrent cold renders on the small VPS.
            if (!renderLock.tryLock()) return retry(503, "2");
            try {
                synchronized (cache) { png = cache.get(slug); }
                if (png == null) {
                    png = renderer.render(receipt.get());
                    if (png.length > 300_000) return retry(503, "60");
                    synchronized (cache) {
                        cache.put(slug, png);
                        if (cache.size() > 32) cache.remove(cache.keySet().iterator().next());
                    }
                }
            } finally { renderLock.unlock(); }
        }
        // A receipt may expire while its first image is being drawn.
        var expiresAt = receipt.get().getExpiresAt();
        if (expiresAt != null && !expiresAt.isAfter(LocalDateTime.now())) {
            synchronized (cache) { cache.remove(slug); }
            return missing();
        }
        // Public immutable caching would keep deleted/expired receipts available downstream.
        return ResponseEntity.ok().header("Cache-Control", "public, max-age=0, must-revalidate")
                .header("X-Robots-Tag", "noindex").header("X-Content-Type-Options", "nosniff").body(png);
    }

    private ResponseEntity<byte[]> missing() {
        return ResponseEntity.notFound().header("Cache-Control", "no-store")
                .header("X-Robots-Tag", "noindex").build();
    }

    private ResponseEntity<byte[]> retry(int status, String seconds) {
        return ResponseEntity.status(status).header("Retry-After", seconds)
                .header("Cache-Control", "no-store").header("X-Robots-Tag", "noindex").build();
    }
}
