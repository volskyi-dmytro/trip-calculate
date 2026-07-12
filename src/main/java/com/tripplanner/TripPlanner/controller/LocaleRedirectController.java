package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.service.LocaleResolver;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * Bare and pre-migration URLs (no /en or /uk prefix) 302 into the visitor's
 * resolved locale, preserving path and query string. Covers old
 * bookmarks/backlinks to "/", "/route-planner", "/dashboard", "/admin", and
 * "/profile". Deliberately does not map "/r/{slug}" — see
 * docs/superpowers/specs/2026-07-12-seo-implementation-design.md.
 */
@RestController
@RequiredArgsConstructor
public class LocaleRedirectController {

    private final LocaleResolver localeResolver;

    @GetMapping({"/", "/route-planner", "/dashboard", "/admin", "/profile"})
    public ResponseEntity<Void> redirectToLocale(HttpServletRequest request) {
        String locale = localeResolver.resolve(request.getHeader(HttpHeaders.ACCEPT_LANGUAGE));
        String uri = request.getRequestURI();
        String path = "/".equals(uri) ? "" : uri;
        String query = request.getQueryString();
        String location = "/" + locale + path + (query != null ? "?" + query : "");
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(location))
                .header(HttpHeaders.VARY, HttpHeaders.ACCEPT_LANGUAGE)
                .build();
    }
}
