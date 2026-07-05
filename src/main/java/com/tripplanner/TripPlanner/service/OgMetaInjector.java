package com.tripplanner.TripPlanner.service;

import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rewrites the SPA's index.html meta tags for a specific receipt so that
 * chat-app crawlers (which never execute JS) see a per-trip link preview.
 * Values are HTML-escaped: receipt labels are user-supplied.
 */
@Component
public class OgMetaInjector {

    public String inject(String html, String title, String description, String url) {
        String safeTitle = HtmlUtils.htmlEscape(title);
        String safeDescription = HtmlUtils.htmlEscape(description);
        String safeUrl = HtmlUtils.htmlEscape(url);

        html = replaceTagContent(html, "og:title", safeTitle);
        html = replaceTagContent(html, "og:description", safeDescription);
        html = replaceTagContent(html, "og:url", safeUrl);
        html = html.replaceFirst("(?s)(<title>).*?(</title>)",
                "$1" + Matcher.quoteReplacement(safeTitle) + "$2");
        return html;
    }

    private String replaceTagContent(String html, String property, String escapedContent) {
        Pattern pattern = Pattern.compile(
                "(<meta property=\"" + Pattern.quote(property) + "\" content=\")[^\"]*(\")");
        return pattern.matcher(html)
                .replaceFirst("$1" + Matcher.quoteReplacement(escapedContent) + "$2");
    }
}
