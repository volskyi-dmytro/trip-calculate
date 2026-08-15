package com.tripplanner.TripPlanner.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SpaShellControllerTest {

    private SpaShellController controller;

    @BeforeEach
    void setUp() {
        controller = new SpaShellController();
    }

    @Test
    void servesEnglishHomeWithSelfCanonicalAndLanguageAlternates() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/en");

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertTrue(html.contains("<html lang=\"en\">"));
        assertTrue(html.contains("<title>Trip Cost Calculator &amp; Route Planner | Trip Calculate</title>"));
        assertTrue(html.contains("<link rel=\"canonical\" href=\"https://trip-calculate.online/en\" />"));
        assertTrue(html.contains("hreflang=\"en\" href=\"https://trip-calculate.online/en\""));
        assertTrue(html.contains("hreflang=\"uk\" href=\"https://trip-calculate.online/uk\""));
        assertTrue(html.contains("hreflang=\"x-default\" href=\"https://trip-calculate.online/\""));
        assertTrue(html.contains("property=\"og:url\" content=\"https://trip-calculate.online/en\""));
    }

    @Test
    void servesUkrainianRoutePlannerWithDistinctLocalizedMetadata() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uk/route-planner");

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertTrue(html.contains("<html lang=\"uk\">"));
        assertTrue(html.contains("<title>Планувальник маршрутів і витрат на пальне | Trip Calculate</title>"));
        assertTrue(html.contains("<link rel=\"canonical\" href=\"https://trip-calculate.online/uk/route-planner\" />"));
        assertTrue(html.contains("hreflang=\"en\" href=\"https://trip-calculate.online/en/route-planner\""));
        assertTrue(html.contains("hreflang=\"uk\" href=\"https://trip-calculate.online/uk/route-planner\""));
        assertTrue(html.contains("hreflang=\"x-default\" href=\"https://trip-calculate.online/route-planner\""));
        assertTrue(html.contains("property=\"og:url\" content=\"https://trip-calculate.online/uk/route-planner\""));
        assertFalse(html.contains("content=\"https://trip-calculate.online\" />"));
    }

    @Test
    void marksNonPublicLocaleRoutesNoindexWithoutHomeCanonical() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/en/dashboard");

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertEquals("noindex, nofollow", response.getHeaders().getFirst("X-Robots-Tag"));
        assertTrue(html.contains("<html lang=\"en\">"));
        assertFalse(html.contains("<link rel=\"canonical\""));
        assertFalse(html.contains("hreflang="));
    }
}
