package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.routing.CityRouteService;
import com.tripplanner.TripPlanner.routing.RoutingController;
import com.tripplanner.TripPlanner.routing.RoutingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockHttpServletRequest;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SpaShellControllerTest {

    private SpaShellController controller;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        RoutingService routingService = mock(RoutingService.class);
        // No live distance in unit tests: forces the catalog estimate fallback, fast and offline.
        when(routingService.calculateRoute(anyList())).thenReturn(Map.of(
                "totalDistance", 0, "totalDuration", 0,
                "geometry", List.of(), "segments", List.of()));

        jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenReturn(List.of());

        CityRouteService cityRouteService = new CityRouteService(routingService, jdbc);
        controller = new SpaShellController(cityRouteService, new ObjectMapper());
    }

    @SuppressWarnings("unchecked")
    private void mockFuelPrice(double price, Instant fetchedAt) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("currency")).thenReturn("UAH");
        when(rs.getDouble("price")).thenReturn(price);
        when(rs.getTimestamp("fetched_at")).thenReturn(Timestamp.from(fetchedAt));
        when(jdbc.query(startsWith("SELECT price"), any(RowMapper.class))).thenAnswer(inv -> {
            RowMapper<Object> mapper = inv.getArgument(1);
            Object row = mapper.mapRow(rs, 0);
            return row == null ? List.of() : List.of(row);
        });
    }

    @Test
    void servesEnglishHomeWithSelfCanonicalAndLanguageAlternates() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/en");

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertTrue(html.contains("<html lang=\"en\">"));
        assertTrue(html.contains("<title>Road Trip Fuel Cost Calculator for Ukraine and Europe — Split Costs | Trip Calculate</title>"));
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
        assertTrue(html.contains("<title>Планувальник маршруту на карті з пальним і погодою — AI-асистент | Trip Calculate</title>"));
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
            "/uk/route-planner,uk,https://trip-calculate.online/uk/route-planner,https://trip-calculate.online/route-planner",
            "/en/privacy,en,https://trip-calculate.online/en/privacy,https://trip-calculate.online/en/privacy",
            "/uk/privacy,uk,https://trip-calculate.online/uk/privacy,https://trip-calculate.online/en/privacy",
            "/en/terms,en,https://trip-calculate.online/en/terms,https://trip-calculate.online/en/terms",
            "/uk/terms,uk,https://trip-calculate.online/uk/terms,https://trip-calculate.online/en/terms"
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

    @ParameterizedTest
    @CsvSource({
            "/en,en_GB,uk_UA,fuel costs for any road trip",
            "/uk,uk_UA,en_GB,витрати на пальне",
            "/en/privacy,en_GB,uk_UA,fuel costs for any road trip",
            "/uk/route/kyiv-lviv,uk_UA,en_GB,витрати на пальне"
    })
    void emitsLocalizedOpenGraphLocaleSiteNameAndImageAlt(
            String path, String ogLocale, String alternate, String altFragment) throws Exception {
        String html = controller.shell(new MockHttpServletRequest("GET", path)).getBody();

        assertEquals(1, occurrences(html, "<meta property=\"og:locale\" content=\"" + ogLocale + "\" />"));
        assertEquals(1, occurrences(html, "<meta property=\"og:locale:alternate\" content=\"" + alternate + "\" />"));
        assertEquals(1, occurrences(html, "<meta property=\"og:site_name\" content=\"Trip Calculate\" />"));
        Matcher alt = Pattern.compile("<meta property=\"og:image:alt\" content=\"([^\"]*)\" />").matcher(html);
        assertTrue(alt.find());
        assertTrue(alt.group(1).contains(altFragment), alt.group(1));
        assertFalse(alt.find());
    }

    @Test
    void cityRoutePageEmbedsItsDataSoCrawlersDontNeedTheApi() throws Exception {
        String html = controller.shell(new MockHttpServletRequest("GET", "/uk/route/kyiv-lviv")).getBody();

        Matcher island = Pattern.compile(
                "<script type=\"application/json\" id=\"city-route-data\" data-slug=\"kyiv-lviv\" data-locale=\"uk\">(.*?)</script>",
                Pattern.DOTALL).matcher(html);
        assertTrue(island.find(), "missing JSON island");
        Map<?, ?> data = new ObjectMapper().readValue(island.group(1), Map.class);
        assertEquals("kyiv-lviv", data.get("slug"));
        assertEquals("Київ", data.get("fromName"));
        assertNotNull(data.get("distanceKm"));
    }

    @Test
    void jsonInsideScriptElementsCannotBreakOutOrOpenComments() {
        String escaped = SpaShellController.escapeForScript("{\"name\":\"<!--<script></script>\"}");
        assertFalse(escaped.contains("<"), escaped);
        assertEquals("{\"name\":\"\\u003c!--\\u003cscript>\\u003c/script>\"}", escaped);
    }

    @Test
    void homeAndLegalPagesCarryNoCityData() throws Exception {
        for (String path : List.of("/en", "/uk/privacy")) {
            String html = controller.shell(new MockHttpServletRequest("GET", path)).getBody();
            assertFalse(html.contains("city-route-data"), path);
        }
    }

    @Test
    void ukrainianHomeSnippetTargetsTheCalculatorIntentNotOneRoute() throws Exception {
        mockFuelPrice(60.0, Instant.now());
        String html = controller.shell(new MockHttpServletRequest("GET", "/uk")).getBody();

        assertTrue(html.contains("<title>Розрахувати вартість поїздки на авто — калькулятор пального | Trip Calculate</title>"));
        Matcher description = Pattern.compile("<meta name=\"description\" content=\"([^\"]*)\"").matcher(html);
        assertTrue(description.find());
        assertTrue(description.group(1).startsWith("Розрахуйте вартість поїздки на авто"), description.group(1));
        assertFalse(description.group(1).contains("Київ"), "a single route reads as a route guide");
        assertFalse(description.group(1).contains("грн"), "no volatile prices in the home snippet");
    }

    @Test
    void homeShipsThePopularRouteListSoCrawlersNeedNoApiCall() throws Exception {
        String html = controller.shell(new MockHttpServletRequest("GET", "/uk")).getBody();
        Matcher island = Pattern.compile("<script type=\"application/json\" id=\"city-routes-data\">(.*?)</script>").matcher(html);
        assertTrue(island.find());
        List<Map<String, Object>> routes = new ObjectMapper().readValue(island.group(1), List.class);
        assertEquals(com.tripplanner.TripPlanner.routing.CityRouteCatalog.ALL.size(), routes.size());
        assertEquals("kyiv-lviv", routes.get(0).get("slug"));
        assertEquals(Map.of("uk", "Київ", "en", "Kyiv"), routes.get(0).get("from"));
    }

    @Test
    void legalPagesServeLocalizedTitleAndCrawlableNoscript() throws Exception {
        String uk = controller.shell(new MockHttpServletRequest("GET", "/uk/privacy")).getBody();
        assertTrue(uk.contains("<title>Політика конфіденційності | Trip Calculate</title>"));
        assertTrue(uk.contains("<h1>Політика конфіденційності</h1>"));
        assertTrue(uk.contains("href=\"https://trip-calculate.online/uk/terms\""));

        String en = controller.shell(new MockHttpServletRequest("GET", "/en/terms")).getBody();
        assertTrue(en.contains("<title>Terms of Use | Trip Calculate</title>"));
        assertTrue(en.contains("\"@type\":\"WebPage\""));
        assertTrue(en.contains("href=\"https://trip-calculate.online/en/privacy\""));
    }

    @Test
    void homeAndRoutePlannerEmitValidWebApplicationJsonLd() throws Exception {
        for (String path : List.of("/en", "/uk/route-planner")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            String html = controller.shell(request).getBody();

            String json = extractJsonLd(html, "WebApplication");
            assertNotNull(json, "expected a WebApplication JSON-LD block for " + path);
            Map<String, Object> parsed = new ObjectMapper().readValue(json, Map.class);
            assertEquals("WebApplication", parsed.get("@type"));
            assertEquals("Trip Calculate", parsed.get("name"));
            assertTrue(parsed.containsKey("description"));
        }
    }

    @Test
    void homeNoscriptIsEscapedAndLinksOtherLocaleRoutePlannerAndAllCityRoutes() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uk");
        String html = controller.shell(request).getBody();

        assertTrue(html.contains("<noscript>"));
        assertTrue(html.contains("href=\"https://trip-calculate.online/en\""));
        assertTrue(html.contains("href=\"https://trip-calculate.online/uk/route-planner\""));
        assertTrue(html.contains("href=\"https://trip-calculate.online/uk/route/kyiv-lviv\""));
        // 20 catalog entries + other-locale + route-planner links
        assertEquals(22, occurrences(html, "<li><a href="));
    }

    @Test
    void servesKnownCityRoutePageWithFallbackFactsWhenLiveRoutingAndFuelPriceAreUnavailable() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uk/route/kyiv-lviv");

        ResponseEntity<String> response = controller.shell(request);
        String html = response.getBody();

        assertEquals(200, response.getStatusCode().value());
        assertFalse(response.getHeaders().containsKey("X-Robots-Tag"));
        assertTrue(html.contains("Київ → Львів"));
        assertTrue(html.contains("<link rel=\"canonical\" href=\"https://trip-calculate.online/uk/route/kyiv-lviv\" />"));
        assertTrue(html.contains("hreflang=\"en\" href=\"https://trip-calculate.online/en/route/kyiv-lviv\""));
        assertTrue(html.contains("hreflang=\"x-default\" href=\"https://trip-calculate.online/uk/route/kyiv-lviv\""));
        assertNotNull(extractJsonLd(html, "WebApplication"));
        assertNotNull(extractJsonLd(html, "BreadcrumbList"));
        assertTrue(html.contains("<noscript>"));
        // No fuel row mocked -> null price -> the no-price copy, not an invented number.
        assertTrue(html.contains("Розрахуйте точну вартість пального"));
    }

    @Test
    void cityRoutePageIncludesComputedCostWhenFuelPriceIsAvailable() throws Exception {
        mockFuelPrice(58.90, Instant.now());
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/en/route/kyiv-lviv");

        String html = controller.shell(request).getBody();

        assertTrue(html.contains("Kyiv → Lviv"));
        assertTrue(html.contains("UAH"));
    }

    @Test
    void returns404WithNoindexForUnknownCityRouteSlug() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/uk/route/nope");

        ResponseEntity<String> response = controller.shell(request);

        assertEquals(404, response.getStatusCode().value());
        assertEquals("noindex, nofollow", response.getHeaders().getFirst("X-Robots-Tag"));
    }

    @Test
    void homeEmitsWebSiteJsonLdForTheSiteName() throws Exception {
        String html = controller.shell(new MockHttpServletRequest("GET", "/uk")).getBody();
        Map<String, Object> site = new ObjectMapper().readValue(extractJsonLd(html, "WebSite"), Map.class);
        assertEquals("Trip Calculate", site.get("name"));
        assertEquals("https://trip-calculate.online/uk", site.get("url"));
    }

    @Test
    void cityRouteStatesItsMethodAndThatTheFigureIsOneWayFuelOnly() throws Exception {
        mockFuelPrice(58.90, Instant.now());
        String en = controller.shell(new MockHttpServletRequest("GET", "/en/route/kyiv-lviv")).getBody();
        assertTrue(en.contains("litres = distance × L/100 km ÷ 100"));
        assertTrue(en.contains("tolls, parking and accommodation are not included"));
        assertTrue(en.contains("do not reflect closures"));
        Matcher description = Pattern.compile("<meta name=\"description\" content=\"([^\"]*)\"").matcher(en);
        assertTrue(description.find());
        assertTrue(description.group(1).contains("One-way fuel") && description.group(1).contains("7.5 L/100 km"),
                description.group(1));
    }

    /**
     * sitemap.xml is hand-written; this keeps it equal to what the server
     * actually serves as indexable: every entry is a 200 without noindex, its
     * alternates match the page's own hreflang tags, every catalog route is
     * listed, and nothing private or redirecting is.
     */
    @Test
    void sitemapListsExactlyTheIndexablePagesWithTheSameAlternatesAsTheirHtml() throws Exception {
        String xml = java.nio.file.Files.readString(java.nio.file.Path.of("frontend/public/sitemap.xml"));
        org.w3c.dom.Document doc = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                .newDocumentBuilder().parse(new java.io.ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        org.w3c.dom.NodeList urls = doc.getElementsByTagName("url");

        java.util.Set<String> expected = new java.util.TreeSet<>();
        for (String page : List.of("", "/route-planner", "/privacy", "/terms")) {
            expected.add("/en" + page);
            expected.add("/uk" + page);
        }
        for (var route : com.tripplanner.TripPlanner.routing.CityRouteCatalog.ALL) {
            expected.add("/en/route/" + route.slug());
            expected.add("/uk/route/" + route.slug());
        }

        java.util.Set<String> listed = new java.util.TreeSet<>();
        String origin = "https://trip-calculate.online";
        for (int i = 0; i < urls.getLength(); i++) {
            org.w3c.dom.Element url = (org.w3c.dom.Element) urls.item(i);
            String loc = url.getElementsByTagName("loc").item(0).getTextContent().trim();
            assertTrue(loc.startsWith(origin), loc);
            String path = loc.substring(origin.length());
            assertTrue(listed.add(path), "duplicate " + path);

            ResponseEntity<String> response = controller.shell(new MockHttpServletRequest("GET", path));
            assertEquals(200, response.getStatusCode().value(), path);
            assertFalse(response.getHeaders().containsKey("X-Robots-Tag"), path);

            org.w3c.dom.NodeList links = url.getElementsByTagName("xhtml:link");
            assertEquals(3, links.getLength(), path);
            for (int j = 0; j < links.getLength(); j++) {
                org.w3c.dom.Element link = (org.w3c.dom.Element) links.item(j);
                String tag = "<link rel=\"alternate\" hreflang=\"" + link.getAttribute("hreflang")
                        + "\" href=\"" + link.getAttribute("href") + "\" />";
                assertTrue(response.getBody().contains(tag), path + " html lacks " + tag);
            }
        }
        assertEquals(expected, listed);
    }

    @Test
    void preloadsTheCurrentSeasonsHeroWithTheHeadersMediaSplit() throws Exception {
        String preload = SpaShellController.heroPreload(java.time.LocalDate.of(2026, 10, 1));
        assertTrue(preload.contains("href=\"/images/seasons-v1/autumn-mobile.webp\" media=\"(max-width: 767px)\""));
        assertTrue(preload.contains("href=\"/images/seasons-v1/autumn-desktop.webp\" media=\"(min-width: 768px)\""));
        assertEquals("winter", SpaShellController.season(java.time.Month.DECEMBER));
        assertEquals("winter", SpaShellController.season(java.time.Month.FEBRUARY));
        assertEquals("spring", SpaShellController.season(java.time.Month.MARCH));
        assertEquals("summer", SpaShellController.season(java.time.Month.AUGUST));
        // Every preloaded file must exist, or the preload is a wasted 404.
        for (java.time.Month month : java.time.Month.values()) {
            for (String variant : List.of("-mobile.webp", "-desktop.webp")) {
                assertTrue(java.nio.file.Files.exists(java.nio.file.Path.of(
                        "frontend/public/images/seasons-v1/" + SpaShellController.season(month) + variant)));
            }
        }
        String html = controller.shell(new MockHttpServletRequest("GET", "/uk")).getBody();
        assertEquals(2, occurrences(html, "rel=\"preload\" as=\"image\""));
    }

    private String extractJsonLd(String html, String type) {
        int index = 0;
        while (true) {
            int start = html.indexOf("<script type=\"application/ld+json\">", index);
            if (start < 0) {
                return null;
            }
            start += "<script type=\"application/ld+json\">".length();
            int end = html.indexOf("</script>", start);
            String json = html.substring(start, end);
            if (json.contains("\"" + type + "\"")) {
                return json;
            }
            index = end;
        }
    }

    private int occurrences(String text, String fragment) {
        return (text.length() - text.replace(fragment, "").length()) / fragment.length();
    }
}
