package com.tripplanner.TripPlanner.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import java.util.regex.Pattern;

/**
 * Remembers where a visitor was when they clicked "Sign in with Google", so the
 * OAuth success handler can send them back there (same page, same language)
 * instead of the homepage.
 *
 * <p>The frontend calls {@code /oauth2/authorization/google?returnTo=/en/route-planner}.
 * The path is stored in the session before the redirect to Google and read back
 * once on success. Only same-origin, locale-prefixed app paths are accepted, so
 * the parameter can never become an open redirect.
 */
public final class LoginReturnTo {

    static final String SESSION_ATTRIBUTE = "LOGIN_RETURN_TO";
    static final String PARAMETER = "returnTo";
    private static final int MAX_LENGTH = 512;

    // "/en" or "/uk", optionally followed by "/..." , "?..." or "#...".
    // No "//", no backslashes, no control characters, no scheme.
    private static final Pattern ALLOWED =
            Pattern.compile("^/(en|uk)(?:[/?#][\\x21-\\x7E]*)?$");

    private LoginReturnTo() {
    }

    /** Returns the path if it is a safe same-origin app path, otherwise {@code null}. */
    public static String sanitize(String candidate) {
        if (candidate == null || candidate.isEmpty() || candidate.length() > MAX_LENGTH) {
            return null;
        }
        if (candidate.contains("//") || candidate.contains("\\") || candidate.contains("/..")) {
            return null;
        }
        return ALLOWED.matcher(candidate).matches() ? candidate : null;
    }

    /** Stores a valid {@code returnTo} request parameter in the session (no-op otherwise). */
    public static void capture(HttpServletRequest request) {
        String safe = sanitize(request.getParameter(PARAMETER));
        if (safe != null) {
            request.getSession(true).setAttribute(SESSION_ATTRIBUTE, safe);
        }
    }

    /** Reads and removes the stored path; {@code null} when none was stored. */
    public static String consume(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object value = session.getAttribute(SESSION_ATTRIBUTE);
        session.removeAttribute(SESSION_ATTRIBUTE);
        return value instanceof String s ? sanitize(s) : null;
    }
}
