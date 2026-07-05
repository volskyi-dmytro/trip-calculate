package com.tripplanner.TripPlanner.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Telegram/WhatsApp crawlers read only these tags — a silent regression here
 * kills the viral loop without breaking anything visible in the app.
 * Content is attacker-influenced (receipt labels), so escaping is load-bearing.
 */
class OgMetaInjectorTest {

    private static final String TEMPLATE = """
            <!DOCTYPE html>
            <html lang="uk">
              <head>
                <title>Trip Calculate — trip cost calculator and route planner</title>
                <meta property="og:title" content="Trip Calculate" />
                <meta property="og:description" content="Calculate fuel costs, plan routes, and split trip expenses per passenger." />
                <meta property="og:url" content="https://trip-calculate.online" />
              </head>
              <body></body>
            </html>
            """;

    private final OgMetaInjector injector = new OgMetaInjector();

    @Test
    void replacesTitleDescriptionAndUrl() {
        String html = injector.inject(TEMPLATE,
                "Kyiv → Lviv · 540 km · 587.25 UAH/person",
                "Fuel total 2349.00 UAH, split between 4 people.",
                "https://trip-calculate.online/r/abc12345");

        assertTrue(html.contains("content=\"Kyiv &rarr; Lviv &middot; 540 km &middot; 587.25 UAH/person\"")
                        || html.contains("Kyiv → Lviv"),
                "og:title should carry the trip summary");
        assertFalse(html.contains("content=\"Trip Calculate\" "), "default og:title should be replaced");
        assertTrue(html.contains("https://trip-calculate.online/r/abc12345"));
        assertTrue(html.contains("<title>Kyiv"), "document title should be replaced too");
    }

    @Test
    void escapesQuotesSoContentCannotBreakOutOfAttribute() {
        String html = injector.inject(TEMPLATE,
                "evil\" /><script>alert(1)</script>",
                "desc", "https://trip-calculate.online/r/x");

        assertFalse(html.contains("<script>alert(1)</script>"));
    }

    @Test
    void leavesTemplateIntactOtherwise() {
        String html = injector.inject(TEMPLATE, "t", "d", "u");
        assertTrue(html.contains("<body></body>"));
        assertTrue(html.contains("<!DOCTYPE html>"));
    }
}
