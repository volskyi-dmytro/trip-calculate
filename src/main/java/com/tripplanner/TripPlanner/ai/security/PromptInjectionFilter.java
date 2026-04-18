package com.tripplanner.TripPlanner.ai.security;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Utility class (not a Servlet filter) providing first-line prompt-injection defence.
 *
 * Rules applied by {@link #sanitize(String)}:
 *  1. Null / blank input is rejected.
 *  2. Length cap: input must not exceed {@value #MAX_LENGTH} characters.
 *  3. Control character strip: characters in [U+0000–U+001F] other than \n (0x0A) and \t (0x09)
 *     are stripped silently.
 *  4. Base64-y blobs > 512 consecutive non-whitespace chars are rejected.
 *  5. Regex deny-list covering the most common jailbreak patterns is applied (case-insensitive).
 *
 * The method returns the sanitised string on success or throws {@link InvalidInputException}
 * on any violation.  The caller (AiAccessFilter) converts the exception to HTTP 400.
 *
 * This is intentionally a utility class rather than a Servlet filter so it can be called
 * at multiple points in the pipeline (request body, future tool inputs, etc.) without
 * filter-chain complexity.
 */
public final class PromptInjectionFilter {

    public static final int MAX_LENGTH = 4096;
    private static final int MAX_BLOB_LENGTH = 512;

    // -------------------------------------------------------------------------
    // Deny-list patterns (case-insensitive, compiled once at class-load time)
    // -------------------------------------------------------------------------

    private static final List<Pattern> DENY_PATTERNS = List.of(
            // Classic jailbreak openers — broad alternation catches multi-word filler phrases
            // e.g. "ignore all prior context", "ignore all previous instructions"
            compile("ignore\\s+(?:everything|all\\s+prior\\s+context|all\\s+previous|all\\s+instructions|all|previous|prior|above)\\s*(?:context|instructions?|prompts?|rules?|directives?|system)?"),
            compile("ignore\\s+(?:[\\w]+\\s+){0,3}(?:previous|all|prior|above|preceding|earlier)\\s+(?:[\\w]+\\s+){0,3}(?:instructions?|prompts?|context|rules?|directives?|system)"),
            compile("disregard\\s+(?:[\\w]+\\s+){0,3}(?:previous|all|prior|above)\\s+(?:instructions?|prompts?|context)"),
            compile("forget\\s+(?:everything|all|previous|prior|your|the)"),

            // Role-switch attempts
            compile("you\\s+are\\s+now\\s+"),
            compile("act\\s+as\\s+(a\\s+)?(different|new|unrestricted|unconstrained|evil|hacked|jailbreak)"),
            // Catches "pretend you are GPT-5", "pretend you are a different AI", etc.
            compile("pretend\\s+(?:you\\s+are|to\\s+be)"),
            compile("roleplay\\s+as\\s+"),

            // System-prompt disclosure
            compile("(reveal|show|print|output|repeat|tell\\s+me)\\s+(your\\s+)?(system\\s+prompt|instructions|initial\\s+prompt|prompt\\s+template)"),
            compile("what\\s+(are|were|is)\\s+your\\s+(original\\s+)?(instructions?|system\\s+prompt)"),

            // DAN / classic jailbreak codes
            compile("\\bDAN\\b"),
            compile("developer\\s+mode"),
            compile("jailbreak"),

            // Prompt-termination injection
            compile("</?(system|user|assistant|human)>"),
            compile("\\[\\s*INST\\s*\\]|\\[/?\\s*SYS\\s*\\]|<\\|im_start\\|>|<\\|im_end\\|>"),

            // Token manipulation
            compile("ignore\\s+token\\s+limit"),
            compile("bypass\\s+(content\\s+)?(filter|moderation|safety|policy|restriction)"),
            compile("(disable|turn\\s+off|override)\\s+(safety|filter|content\\s+policy|moderation)"),

            // Data exfiltration patterns
            compile("(send|leak|exfil(trate)?|transmit)\\s+(the\\s+)?(training|private|confidential|secret|internal)\\s+data"),

            // "Repeat the text above" pattern
            compile("repeat\\s+(the\\s+)?(text|words|content|message)\\s+above")
    );

    // Long consecutive non-whitespace run (possible base64 or encoded payload)
    private static final Pattern LONG_BLOB = Pattern.compile("\\S{" + MAX_BLOB_LENGTH + ",}");

    // Control chars except \n (0x0A) and \t (0x09)
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\x00-\\x08\\x0B-\\x0C\\x0E-\\x1F\\x7F]");

    private PromptInjectionFilter() {}

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Sanitises the given input string through all prompt-injection defence layers.
     *
     * @param input raw user input
     * @return sanitised input (control chars stripped, safe to relay)
     * @throws InvalidInputException if the input violates any hard rule
     */
    public static String sanitize(String input) throws InvalidInputException {
        if (input == null || input.isBlank()) {
            throw new InvalidInputException("Input must not be blank");
        }

        // Step 1: length cap (before any processing to avoid DoS)
        if (input.length() > MAX_LENGTH) {
            throw new InvalidInputException(
                    "Input exceeds maximum length",
                    "Input length " + input.length() + " exceeds cap " + MAX_LENGTH);
        }

        // Step 2: strip control characters (modifies the string silently)
        String cleaned = CONTROL_CHARS.matcher(input).replaceAll("");

        // Step 3: reject long blob (possible base64 / encoded payload)
        if (LONG_BLOB.matcher(cleaned).find()) {
            throw new InvalidInputException(
                    "Input contains a disallowed token",
                    "Long non-whitespace blob exceeding " + MAX_BLOB_LENGTH + " characters");
        }

        // Step 4: deny-list patterns
        // Public message is fixed — the matching pattern is operator-only diagnostic detail
        // exposed via getDetail(). Echoing pattern.toString() into the message would leak the
        // deny-list to any caller that propagates getMessage() to a response (e.g. AgentController).
        String lower = cleaned.toLowerCase();
        for (Pattern p : DENY_PATTERNS) {
            if (p.matcher(lower).find()) {
                throw new InvalidInputException(
                        "Input contains a disallowed pattern",
                        "Matched deny-list pattern: " + p.pattern());
            }
        }

        return cleaned;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private static Pattern compile(String pattern) {
        return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    }
}
