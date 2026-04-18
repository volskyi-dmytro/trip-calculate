package com.tripplanner.TripPlanner.ai.access;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.ai.security.InvalidInputException;
import com.tripplanner.TripPlanner.ai.security.PromptInjectionFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;


/**
 * Servlet filter (OncePerRequestFilter) that gates all /api/ai/** requests.
 *
 * Execution order per CLAUDE.md rule 3:
 *  1. Resolve authenticated principal — 401 if absent.
 *  2. Rate limit (user + IP via AiAccessService) — 429 with Retry-After if exceeded.
 *  3. Supabase grant check — 403 if no valid grant.
 *  4. Usage cap check — 429 with Retry-After if over cap.
 *  5. For POST requests with a body: apply PromptInjectionFilter.sanitize on the
 *     "message" field — 400 if rejected.
 *  6. Set aiUserId request attribute and proceed down the chain.
 *
 * shouldNotFilter returns true for any path not starting with /api/ai/ so the
 * filter imposes zero overhead on the rest of the application.
 *
 * Filter ordering: registered AFTER the OAuth2 filter chain (via SecurityConfig
 * addFilterAfter placement).  By the time this filter runs, SecurityContext is
 * fully populated by the AuthorityRestoreFilter.
 */
@RequiredArgsConstructor
@Slf4j
public class AiAccessFilter extends OncePerRequestFilter {

    private static final String AI_PATH_PREFIX = "/api/ai/";
    public static final String AI_USER_ID_ATTRIBUTE = "aiUserId";

    private final AiAccessService aiAccessService;
    private final ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // shouldNotFilter
    // -------------------------------------------------------------------------

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        // Only apply to /api/ai/** paths
        return !uri.startsWith(AI_PATH_PREFIX);
    }

    // -------------------------------------------------------------------------
    // Core filter logic
    // -------------------------------------------------------------------------

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        // Step 1 — resolve principal
        String userId = resolveUserId();
        if (userId == null) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                    "unauthenticated", "Authentication is required for AI endpoints", null);
            return;
        }

        String clientIp = resolveClientIp(request);

        // Steps 2–4 — delegate to AiAccessService (rate limit → grant → cap)
        AccessResult result = aiAccessService.check(userId, clientIp);

        if (result.isBlocking()) {
            int status  = result.httpStatus();
            String code = switch (result) {
                case NO_GRANT     -> "no_grant";
                case OVER_CAP     -> "over_cap";
                case RATE_LIMITED -> "rate_limited";
                default           -> "access_denied";
            };
            String message = switch (result) {
                case NO_GRANT     -> "You do not have access to the AI Trip Manager. Request access to get started.";
                case OVER_CAP     -> "You have reached your usage limit. Please try again later.";
                case RATE_LIMITED -> "Too many requests. Please slow down.";
                default           -> "Access denied.";
            };

            if (result.retryAfterSeconds() != null) {
                response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
            }
            writeError(response, status, code, message, result.retryAfterSeconds());
            return;
        }

        // Step 5 — prompt injection screening for POST requests with a body.
        // Only applies when the request body contains a "message" field as plain text or JSON.
        // The check is best-effort on the raw body — for multipart and other content types,
        // AgentController is responsible for sanitising its own fields before passing to Python.
        if ("POST".equalsIgnoreCase(request.getMethod())) {
            String rawMessage = request.getParameter("message");
            if (rawMessage != null) {
                try {
                    PromptInjectionFilter.sanitize(rawMessage);
                } catch (InvalidInputException e) {
                    log.debug("Prompt injection blocked for userId [{}]: {}", userId, e.getMessage());
                    writeError(response, HttpServletResponse.SC_BAD_REQUEST,
                            "invalid_input", "Input contains disallowed content.", null);
                    return;
                }
            }
        }

        // Step 6 — set aiUserId attribute and proceed
        request.setAttribute(AI_USER_ID_ATTRIBUTE, userId);
        filterChain.doFilter(request, response);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Extracts the Google 'sub' claim (user ID) from the current SecurityContext.
     * Returns null if the user is not authenticated or is anonymous.
     */
    private String resolveUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || "anonymousUser".equals(auth.getPrincipal())) {
            return null;
        }
        try {
            // All authentication in this app uses OAuth2 / OIDC; principal is OAuth2User.
            OAuth2User oauth2User = (OAuth2User) auth.getPrincipal();
            // 'sub' is the Google account identifier — stable and unique.
            String sub = oauth2User.getAttribute("sub");
            if (sub == null || sub.isBlank()) {
                log.warn("Authenticated user has no 'sub' claim in OAuth2 attributes");
                return null;
            }
            return sub;
        } catch (ClassCastException e) {
            log.warn("Principal is not an OAuth2User: {}", auth.getPrincipal().getClass().getName());
            return null;
        }
    }

    /**
     * Returns the real client IP from the servlet request.
     *
     * Blocker 9: application.properties sets server.forward-headers-strategy=framework and
     * server.tomcat.remoteip.* — Spring's RemoteIpFilter already resolves the real IP from
     * X-Forwarded-For and places it in request.getRemoteAddr(). Re-parsing XFF headers in
     * application code lets a client spoof their IP on any path that bypasses Cloudflare.
     * Using getRemoteAddr() trusts only the value already validated by the infrastructure layer.
     */
    private String resolveClientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    private void writeError(HttpServletResponse response, int status,
                            String error, String message,
                            Long retryAfterSeconds) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        Map<String, Object> body;
        if (retryAfterSeconds != null) {
            body = Map.of(
                    "error", error,
                    "message", message,
                    "retry_after_seconds", retryAfterSeconds);
        } else {
            body = Map.of("error", error, "message", message);
        }

        objectMapper.writeValue(response.getWriter(), body);
    }
}
