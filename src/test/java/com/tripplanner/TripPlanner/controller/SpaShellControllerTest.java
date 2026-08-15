package com.tripplanner.TripPlanner.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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

    @ParameterizedTest
    @ValueSource(strings = {"/en/dashboard", "/uk/dashboard", "/en/admin", "/uk/admin"})
    void keepsKnownPrivateLocaleRoutesRoutableAndNoindex(String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertEquals(200, response.getStatusCode().value());
        assertEquals("noindex, nofollow", response.getHeaders().getFirst("X-Robots-Tag"));
        String expectedLanguage = path.startsWith("/en/") ? "en" : "uk";
        assertTrue(html.contains("<html lang=\"" + expectedLanguage + "\">"));
        assertFalse(html.contains("<link rel=\"canonical\""));
        assertFalse(html.contains("hreflang="));
    }

    @Test
    void returns404ForUnknownLocalePath() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uk/does-not-exist");

        ResponseEntity<String> response = controller.shell(request);

        assertEquals(404, response.getStatusCode().value());
        assertEquals("noindex, nofollow", response.getHeaders().getFirst("X-Robots-Tag"));
    }

    @ParameterizedTest
    @CsvSource({
            "/en,en,https://trip-calculate.online/en,https://trip-calculate.online/",
            "/uk,uk,https://trip-calculate.online/uk,https://trip-calculate.online/",
            "/en/route-planner,en,https://trip-calculate.online/en/route-planner,https://trip-calculate.online/route-planner",
            "/uk/route-planner,uk,https://trip-calculate.online/uk/route-planner,https://trip-calculate.online/route-planner"
    })
    void emitsOneConsistentMetadataClusterForEveryPublicRoute(
            String path, String language, String canonical, String xDefault) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertTrue(html.contains("<html lang=\"" + language + "\">"));
        assertEquals(1, occurrences(html, "<link rel=\"canonical\" href=\"" + canonical + "\" />"));
        assertEquals(1, occurrences(html, "hreflang=\"x-default\" href=\"" + xDefault + "\""));
        assertEquals(1, occurrences(html, "property=\"og:url\" content=\"" + canonical + "\""));
        assertEquals(3, occurrences(html, "hreflang=\""));
        assertFalse(response.getHeaders().containsKey("X-Robots-Tag"));
    }

    private int occurrences(String text, String fragment) {
        return (text.length() - text.replace(fragment, "").length()) / fragment.length();
    }
}
