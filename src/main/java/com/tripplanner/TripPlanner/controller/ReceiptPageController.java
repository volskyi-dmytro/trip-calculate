package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.service.OgMetaInjector;
import com.tripplanner.TripPlanner.service.ReceiptService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.io.IOException;
import java.math.RoundingMode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Serves /r/{slug} as index.html with per-receipt OG tags injected.
 * This exists because Telegram/WhatsApp crawlers do not run JavaScript:
 * the SPA alone can never produce a per-trip link preview.
 */
@Controller
@RequiredArgsConstructor
public class ReceiptPageController {

    private final ReceiptService receiptService;
    private final OgMetaInjector ogMetaInjector;

    // Shared trips carry user-written labels — never indexable, but link-preview
    // crawlers (Telegram/WhatsApp) must still read the OG tags, so noindex only.
    private static final String X_ROBOTS_TAG = "X-Robots-Tag";
    private static final String NOINDEX = "noindex";

    @Value("${app.public-base-url:https://trip-calculate.online}")
    private String publicBaseUrl;

    // index.html is immutable per deployment — cache after first read
    private volatile String indexTemplate;

    @GetMapping(value = "/r/{slug}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> receiptPage(@PathVariable String slug) {
        String template;
        try {
            template = template();
        } catch (IOException e) {
            // Dev-mode without a built frontend: index.html isn't on the classpath.
            // Redirect to root where the Vite dev server (or error page) takes over.
            return ResponseEntity.status(302)
                    .location(URI.create("/"))
                    .header(X_ROBOTS_TAG, NOINDEX)
                    .build();
        }

        Optional<TripReceipt> receipt = receiptService.findForPreview(slug);
        if (receipt.isEmpty()) {
            // Unknown/expired: still serve the SPA shell so React's ReceiptPage can
            // render its own "receipt expired" UI, but a real 404 status keeps Google
            // from indexing a page with no content of its own.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                    .header(X_ROBOTS_TAG, NOINDEX)
                    .contentType(MediaType.TEXT_HTML)
                    .body(template);
        }

        String html = ogMetaInjector.inject(template, ogTitle(receipt.get()), ogDescription(receipt.get()),
                publicBaseUrl + "/r/" + slug);

        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(X_ROBOTS_TAG, NOINDEX)
                .body(html);
    }

    private String ogTitle(TripReceipt r) {
        String perPerson = r.getCostPerPerson().setScale(2, RoundingMode.HALF_UP)
                + " " + r.getCurrency()
                + ("uk".equals(r.getLocale()) ? "/особа" : "/person");
        String distance = r.getDistanceKm().setScale(0, RoundingMode.HALF_UP) + " km";
        if (r.getOriginLabel() != null && r.getDestinationLabel() != null) {
            return r.getOriginLabel() + " → " + r.getDestinationLabel()
                    + " · " + distance + " · " + perPerson;
        }
        return ("uk".equals(r.getLocale()) ? "Поїздка" : "Road trip")
                + " · " + distance + " · " + perPerson;
    }

    private String ogDescription(TripReceipt r) {
        if ("uk".equals(r.getLocale())) {
            return "Паливо: " + r.getTotalCost() + " " + r.getCurrency()
                    + " на " + r.getPeople() + " осіб. Розрахуйте свою поїздку на Trip Calculate.";
        }
        return "Fuel total " + r.getTotalCost() + " " + r.getCurrency()
                + ", split between " + r.getPeople()
                + " people. Calculate your own trip on Trip Calculate.";
    }

    private String template() throws IOException {
        String cached = indexTemplate;
        if (cached == null) {
            cached = StreamUtils.copyToString(
                    new ClassPathResource("static/index.html").getInputStream(),
                    StandardCharsets.UTF_8);
            indexTemplate = cached;
        }
        return cached;
    }
}
