package com.tripplanner.TripPlanner.ai.security;

/**
 * Thrown by {@link PromptInjectionFilter#sanitize(String)} when the input
 * violates any of the prompt-injection defence rules.
 *
 * Two-message contract (defence in depth against deny-list leakage):
 *  - {@link #getMessage()} returns a fixed, public-safe summary suitable for
 *    propagating into HTTP responses or other untrusted sinks. It NEVER contains
 *    the matching deny-list pattern, regex, or offending substring.
 *  - {@link #getDetail()} returns the operator-only diagnostic detail (e.g. the
 *    pattern that matched). Suitable only for server-side TRACE logging.
 *
 * Why split: every future caller that writes {@code e.getMessage()} into a response
 * or log forwarder is then safe-by-construction. Operators who need the pattern
 * for triage opt-in via {@code getDetail()}.
 */
public class InvalidInputException extends Exception {

    private final String detail;

    public InvalidInputException(String safeMessage, String detail) {
        super(safeMessage);
        this.detail = detail;
    }

    public InvalidInputException(String safeMessage) {
        this(safeMessage, safeMessage);
    }

    public String getDetail() {
        return detail;
    }
}
