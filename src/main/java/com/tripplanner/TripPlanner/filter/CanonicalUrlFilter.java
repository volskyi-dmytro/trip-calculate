package com.tripplanner.TripPlanner.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Normalizes public SEO URL variants before MVC and Spring Security handle the request.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class CanonicalUrlFilter extends OncePerRequestFilter {

    private static final String WWW_HOST = "www.trip-calculate.online";
    private static final String CANONICAL_ORIGIN = "https://trip-calculate.online";
    private static final String INDEX_HTML_PATH = "/index.html";
    private static final Set<String> PUBLIC_TRAILING_SLASH_PATHS = Set.of(
            "/en/",
            "/uk/",
            "/en/route-planner/",
            "/uk/route-planner/",
            "/en/privacy/",
            "/uk/privacy/",
            "/en/terms/",
            "/uk/terms/");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (isSafeRedirectMethod(request)) {
            String normalizedPath = normalizedPath(request.getRequestURI());
            boolean wwwHost = isWwwHost(request);
            if (INDEX_HTML_PATH.equals(normalizedPath)) {
                // /index.html is a byte-identical duplicate of "/" with no canonical tag
                // of its own (GSC flags it as a competing URL) — collapse it to the
                // homepage in a single hop, honoring www -> apex at the same time.
                String origin = wwwHost ? CANONICAL_ORIGIN : "";
                response.setStatus(HttpStatus.MOVED_PERMANENTLY.value());
                response.setHeader("Location", origin + requestTarget("/", request));
                return;
            }
            if (wwwHost) {
                permanentRedirect(response, CANONICAL_ORIGIN + requestTarget(normalizedPath, request));
                return;
            }
            if (!normalizedPath.equals(request.getRequestURI())) {
                permanentRedirect(response, requestTarget(normalizedPath, request));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private boolean isSafeRedirectMethod(HttpServletRequest request) {
        return "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
    }

    private boolean isWwwHost(HttpServletRequest request) {
        // ForwardedHeaderFilter runs first and exposes the trusted forwarded host
        // through the normalized servlet request while removing the raw header.
        return WWW_HOST.equalsIgnoreCase(request.getServerName());
    }

    private String normalizedPath(String requestPath) {
        return PUBLIC_TRAILING_SLASH_PATHS.contains(requestPath)
                ? requestPath.substring(0, requestPath.length() - 1)
                : requestPath;
    }

    private String requestTarget(String path, HttpServletRequest request) {
        String query = request.getQueryString();
        return path + (query == null ? "" : "?" + query);
    }

    private void permanentRedirect(HttpServletResponse response, String location) {
        response.setStatus(HttpStatus.PERMANENT_REDIRECT.value());
        response.setHeader("Location", location);
    }
}
