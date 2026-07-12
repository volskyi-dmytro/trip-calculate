package com.tripplanner.TripPlanner.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Serves the SPA shell for locale-prefixed app routes ("/en", "/uk",
 * "/en/route-planner", etc.) so React Router can take over client-side.
 * Meta tags are still the shared static defaults from index.html at this
 * stage — per-route/per-locale injection is a follow-up plan, see
 * docs/superpowers/specs/2026-07-12-seo-implementation-design.md.
 */
@Controller
public class SpaShellController {

    private volatile String indexTemplate;

    @GetMapping({"/en", "/en/**", "/uk", "/uk/**"})
    public ResponseEntity<String> shell() throws IOException {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .contentType(MediaType.TEXT_HTML)
                .body(template());
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
