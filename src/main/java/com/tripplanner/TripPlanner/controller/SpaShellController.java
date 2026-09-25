package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.routing.CityRouteCatalog;
import com.tripplanner.TripPlanner.routing.CityRouteService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves the SPA shell for locale-prefixed app routes ("/en", "/uk",
 * "/en/route-planner", "/uk/route/kyiv-lviv", etc.) so React Router can take
 * over client-side. Indexable routes receive localized, route-specific
 * metadata, JSON-LD structured data, and a crawlable &lt;noscript&gt;
 * fallback before the browser executes JavaScript.
 */
@Controller
public class SpaShellController {

    private static final String SITE_ORIGIN = "https://trip-calculate.online";
    private static final Set<String> NON_PUBLIC_APP_ROUTES = Set.of(
            "/en/dashboard", "/en/dashboard/",
            "/uk/dashboard", "/uk/dashboard/",
            "/en/admin", "/en/admin/",
            "/uk/admin", "/uk/admin/");
    private static final Pattern HTML_LANG = Pattern.compile("(?i)<html\\s+lang=\"[^\"]*\"");
    private static final Pattern TITLE = Pattern.compile("(?is)(<title>).*?(</title>)");
    private static final Pattern CITY_ROUTE_PATH = Pattern.compile("^/route/([a-z0-9-]+)$");

    private final CityRouteService cityRouteService;
    private final ObjectMapper objectMapper;

    private volatile String indexTemplate;

    public SpaShellController(CityRouteService cityRouteService, ObjectMapper objectMapper) {
        this.cityRouteService = cityRouteService;
        this.objectMapper = objectMapper;
    }

    @GetMapping({"/en", "/en/**", "/uk", "/uk/**"})
    public ResponseEntity<String> shell(HttpServletRequest request) throws IOException {
        PageMetadata metadata = resolveMetadata(request.getRequestURI());
        String html = metadata.indexable
                ? injectMetadata(template(), metadata)
                : injectLanguage(template(), metadata.locale);
        boolean routable = metadata.indexable || NON_PUBLIC_APP_ROUTES.contains(request.getRequestURI());
        ResponseEntity.BodyBuilder response = ResponseEntity.status(routable ? HttpStatus.OK : HttpStatus.NOT_FOUND)
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .contentType(MediaType.TEXT_HTML);
        if (!metadata.indexable) {
            response.header("X-Robots-Tag", "noindex, nofollow");
        }
        return response.body(html);
    }

    private PageMetadata resolveMetadata(String requestPath) {
        boolean english = requestPath.equals("/en") || requestPath.startsWith("/en/");
        String locale = english ? "en" : "uk";
        String localeRoot = "/" + locale;
        String remainder = requestPath.equals(localeRoot) ? "" : requestPath.substring(localeRoot.length());
        if (remainder.length() > 1 && remainder.endsWith("/")) {
            remainder = remainder.substring(0, remainder.length() - 1);
        }

        if (remainder.isEmpty()) {
            return buildHomeMetadata(locale);
        }
        if (remainder.equals("/route-planner")) {
            return buildRoutePlannerMetadata(locale);
        }
        if (remainder.equals("/privacy") || remainder.equals("/terms")) {
            return buildLegalMetadata(locale, remainder.substring(1));
        }
        Matcher cityRouteMatch = CITY_ROUTE_PATH.matcher(remainder);
        if (cityRouteMatch.matches()) {
            PageMetadata cityRoute = buildCityRouteMetadata(locale, cityRouteMatch.group(1));
            if (cityRoute != null) {
                return cityRoute;
            }
        }
        return PageMetadata.notIndexable(locale);
    }

    // ------------------------------------------------------------------
    // Page metadata builders
    // ------------------------------------------------------------------

    private PageMetadata buildHomeMetadata(String locale) {
        boolean english = "en".equals(locale);
        String title = english
                ? "Road Trip Fuel Cost Calculator for Europe — Split Costs | Trip Calculate"
                : "Калькулятор вартості поїздки на авто — пальне і поділ витрат | Trip Calculate";
        String description = english
                ? "Live fuel prices by country, real driving distances and a per-passenger split. Work out your European road trip cost in seconds — free, no sign-up."
                : ukrainianHomeDescription();
        String ogTitle = english
                ? "Road Trip Fuel Cost Calculator for Europe | Trip Calculate"
                : "Калькулятор вартості поїздки на авто | Trip Calculate";

        String canonical = SITE_ORIGIN + "/" + locale;
        String jsonLd = jsonLdWebApplication(canonical, locale, description);
        String noscript = homeNoscript(english, locale);
        return new PageMetadata(locale, "", title, description, ogTitle, true, jsonLd, noscript);
    }

    // Quotes today's Kyiv → Lviv estimate (the same cached figures as its city page)
    // instead of hard-coded numbers that go stale; no prices when none are known.
    private String ukrainianHomeDescription() {
        String tail = "Розрахуйте свою поїздку за реальною відстанню — безкоштовно, без реєстрації.";
        Map<String, Object> kyivLviv = cityRouteService.get("kyiv-lviv", "uk").orElse(null);
        if (kyivLviv == null || kyivLviv.get("totalCost") == null || kyivLviv.get("perPassenger") == null) {
            return "Калькулятор вартості пального для поїздки на авто з поділом витрат між пасажирами. " + tail;
        }
        double total = ((Number) kyivLviv.get("totalCost")).doubleValue();
        double perPassenger = ((Number) kyivLviv.get("perPassenger")).doubleValue();
        return "Київ → Львів ≈ " + formatMoneyUk(total) + " на пальне, по " + formatMoneyUk(perPassenger)
                + " на пасажира. " + tail;
    }

    private PageMetadata buildRoutePlannerMetadata(String locale) {
        boolean english = "en".equals(locale);
        String title = english
                ? "Map Route Planner with Fuel Prices &amp; AI Assistant | Trip Calculate"
                : "Планувальник маршруту на карті з пальним і погодою — AI-асистент | Trip Calculate";
        String description = english
                ? "Plan your route on an interactive map, check live fuel prices by country and weather along the way, and get help from an AI trip assistant — free."
                : "Плануйте маршрут на карті з кількома зупинками, дізнавайтесь ціни на пальне по країнах і погоду в дорозі. AI-асистент допоможе за секунди — безкоштовно.";
        String ogTitle = english
                ? "Route Planner with Fuel Prices &amp; Weather | Trip Calculate"
                : "Планувальник маршрутів із пальним і погодою | Trip Calculate";

        String canonical = SITE_ORIGIN + "/" + locale + "/route-planner";
        String jsonLd = jsonLdWebApplication(canonical, locale, description);
        String noscript = routePlannerNoscript(english, locale);
        return new PageMetadata(locale, "/route-planner", title, description, ogTitle, true, jsonLd, noscript);
    }

    // Titles and descriptions must match frontend/src/i18n/legal.ts.
    private PageMetadata buildLegalMetadata(String locale, String page) {
        boolean english = "en".equals(locale);
        boolean privacy = "privacy".equals(page);
        String name = privacy
                ? (english ? "Privacy Policy" : "Політика конфіденційності")
                : (english ? "Terms of Use" : "Умови користування");
        String description = privacy
                ? (english
                        ? "What data Trip Calculate collects, why, who it is shared with, how long it is kept, which cookies it uses and how to exercise your rights."
                        : "Які дані збирає Trip Calculate, навіщо, кому передає, скільки зберігає, які файли cookie використовує і як скористатися своїми правами.")
                : (english
                        ? "The rules for using Trip Calculate, the free trip cost calculator and route planner: accounts, acceptable use, estimates and liability."
                        : "Правила користування Trip Calculate — безкоштовним калькулятором вартості поїздки та планувальником маршрутів: обліковий запис, допустиме використання, розрахунки й відповідальність.");
        String title = name + " | Trip Calculate";
        String routePath = "/" + page;
        String canonical = SITE_ORIGIN + "/" + locale + routePath;

        Map<String, Object> webPage = new LinkedHashMap<>();
        webPage.put("@context", "https://schema.org");
        webPage.put("@type", "WebPage");
        webPage.put("name", name);
        webPage.put("url", canonical);
        webPage.put("inLanguage", locale);
        webPage.put("description", description);

        String otherPage = privacy ? "/terms" : "/privacy";
        List<NoscriptLink> links = List.of(
                new NoscriptLink(SITE_ORIGIN + "/" + (english ? "uk" : "en") + routePath,
                        english ? "Українська версія" : "English version"),
                new NoscriptLink(SITE_ORIGIN + "/" + locale + otherPage,
                        privacy ? (english ? "Terms of Use" : "Умови користування")
                                : (english ? "Privacy Policy" : "Політика конфіденційності")),
                new NoscriptLink(SITE_ORIGIN + "/" + locale, english ? "Home" : "Головна"));
        String noscript = noscriptBlock(name, List.of(description), links);

        return new PageMetadata(locale, routePath, esc(title), esc(description), esc(title), true,
                toScriptTag(webPage), noscript);
    }

    @SuppressWarnings("unchecked")
    private PageMetadata buildCityRouteMetadata(String locale, String slug) {
        Map<String, Object> facts = cityRouteService.get(slug, locale).orElse(null);
        if (facts == null) {
            return null;
        }
        boolean english = "en".equals(locale);
        String fromName = (String) facts.get("fromName");
        String toName = (String) facts.get("toName");
        double distanceKm = ((Number) facts.get("distanceKm")).doubleValue();
        double durationMin = ((Number) facts.get("durationMin")).doubleValue();
        Double totalCost = facts.get("totalCost") != null ? ((Number) facts.get("totalCost")).doubleValue() : null;
        Double perPassenger = facts.get("perPassenger") != null ? ((Number) facts.get("perPassenger")).doubleValue() : null;
        List<Map<String, Object>> related = (List<Map<String, Object>>) facts.get("related");

        String title = english
                ? fromName + " → " + toName + ": Road Trip Cost, Distance &amp; Fuel Price | Trip Calculate"
                : fromName + " → " + toName + ": вартість поїздки на авто, відстань і пальне | Trip Calculate";
        String description = cityRouteDescription(english, fromName, toName, distanceKm, durationMin, totalCost, perPassenger);
        String ogTitle = fromName + " → " + toName + " | Trip Calculate";

        String routePath = "/route/" + slug;
        String canonical = SITE_ORIGIN + "/" + locale + routePath;
        String homeUrl = SITE_ORIGIN + "/" + locale;
        // The page's own data rides along as a JSON island: CityRoutePage reads it
        // instead of calling /api/city-routes, so crawlers (robots.txt disallows
        // most of /api/) and first-time visitors get the real content at once.
        String jsonLd = jsonLdWebApplication(canonical, locale, description)
                + jsonLdBreadcrumb(homeUrl, "Trip Calculate", canonical, fromName + " → " + toName)
                + cityRouteDataIsland(slug, locale, facts);
        String noscript = cityRouteNoscript(english, locale, slug, fromName, toName,
                distanceKm, durationMin, totalCost, perPassenger, related);

        return new PageMetadata(locale, routePath, title, description, ogTitle, true, jsonLd, noscript);
    }

    private String cityRouteDescription(boolean english, String fromName, String toName,
                                         double distanceKm, double durationMin,
                                         Double totalCost, Double perPassenger) {
        String distance = Math.round(distanceKm) + (english ? " km" : " км");
        String duration = english ? formatDurationEn(durationMin) : formatDurationUk(durationMin);
        if (totalCost != null && perPassenger != null) {
            return english
                    ? fromName + " → " + toName + " ≈ " + distance + ", " + duration + ". Fuel ≈ "
                            + formatMoneyEn(totalCost) + ", " + formatMoneyEn(perPassenger) + " per passenger. Free calculator, real driving distance."
                    : fromName + " → " + toName + " ≈ " + distance + ", " + duration + " у дорозі. Пальне ≈ "
                            + formatMoneyUk(totalCost) + ", по " + formatMoneyUk(perPassenger) + " на пасажира. Розрахуйте поїздку безкоштовно.";
        }
        return english
                ? fromName + " → " + toName + " ≈ " + distance + ", " + duration + ". Calculate the fuel cost and split it between passengers — free, no sign-up."
                : fromName + " → " + toName + " ≈ " + distance + ", " + duration + " у дорозі. Розрахуйте вартість пального та поділіть її між пасажирами — безкоштовно.";
    }

    // ------------------------------------------------------------------
    // JSON-LD
    // ------------------------------------------------------------------

    private String jsonLdWebApplication(String url, String locale, String description) {
        Map<String, Object> offers = new LinkedHashMap<>();
        offers.put("@type", "Offer");
        offers.put("price", "0");
        offers.put("priceCurrency", "UAH");

        Map<String, Object> obj = new LinkedHashMap<>();
        obj.put("@context", "https://schema.org");
        obj.put("@type", "WebApplication");
        obj.put("name", "Trip Calculate");
        obj.put("url", url);
        obj.put("applicationCategory", "TravelApplication");
        obj.put("operatingSystem", "Web");
        obj.put("inLanguage", locale);
        obj.put("offers", offers);
        obj.put("description", description);
        return toScriptTag(obj);
    }

    private String jsonLdBreadcrumb(String homeUrl, String homeName, String pageUrl, String pageName) {
        Map<String, Object> home = new LinkedHashMap<>();
        home.put("@type", "ListItem");
        home.put("position", 1);
        home.put("name", homeName);
        home.put("item", homeUrl);

        Map<String, Object> page = new LinkedHashMap<>();
        page.put("@type", "ListItem");
        page.put("position", 2);
        page.put("name", pageName);
        page.put("item", pageUrl);

        Map<String, Object> obj = new LinkedHashMap<>();
        obj.put("@context", "https://schema.org");
        obj.put("@type", "BreadcrumbList");
        obj.put("itemListElement", List.of(home, page));
        return toScriptTag(obj);
    }

    /**
     * JSON placed inside a script element: every "<" becomes the JSON escape
     * \\u003c, so no value can close the element ("</script>") or open a
     * comment ("<!--") that would swallow the rest of the page.
     */
    static String escapeForScript(String json) {
        return json.replace("<", "\\u003c");
    }

    private String cityRouteDataIsland(String slug, String locale, Map<String, Object> facts) {
        try {
            String json = escapeForScript(objectMapper.writeValueAsString(facts));
            return "\n    <script type=\"application/json\" id=\"city-route-data\" data-slug=\""
                    + esc(slug) + "\" data-locale=\"" + esc(locale) + "\">" + json + "</script>";
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize city route data", e);
        }
    }

    private String toScriptTag(Object payload) {
        try {
            String json = escapeForScript(objectMapper.writeValueAsString(payload));
            return "\n    <script type=\"application/ld+json\">" + json + "</script>";
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize JSON-LD payload", e);
        }
    }

    // ------------------------------------------------------------------
    // Crawlable <noscript> fallback content
    // ------------------------------------------------------------------

    private record NoscriptLink(String href, String text) {}

    private String noscriptBlock(String h1, List<String> paragraphs, List<NoscriptLink> links) {
        StringBuilder sb = new StringBuilder("\n    <noscript>\n      <h1>")
                .append(esc(h1)).append("</h1>\n");
        for (String paragraph : paragraphs) {
            sb.append("      <p>").append(esc(paragraph)).append("</p>\n");
        }
        sb.append("      <ul>\n");
        for (NoscriptLink link : links) {
            sb.append("        <li><a href=\"").append(esc(link.href())).append("\">")
                    .append(esc(link.text())).append("</a></li>\n");
        }
        sb.append("      </ul>\n    </noscript>");
        return sb.toString();
    }

    private String homeNoscript(boolean english, String locale) {
        String h1 = english
                ? "Road Trip Fuel Cost Calculator for Europe"
                : "Калькулятор вартості поїздки на авто";
        List<String> paragraphs = english
                ? List.of(
                        "Trip Calculate works out your road trip's fuel cost from real driving distances and live fuel prices by country, then splits the total between passengers.",
                        "Plan a route on the map, browse a city-to-city fuel cost below, or switch to the Ukrainian version.")
                : List.of(
                        "Trip Calculate рахує вартість пального для вашої поїздки за реальною відстанню та актуальними цінами на пальне по країнах, а потім ділить суму між пасажирами.",
                        "Сплануйте маршрут на карті, перегляньте вартість поїздки між містами нижче або перемкніться на англійську версію.");

        List<NoscriptLink> links = new ArrayList<>();
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + (english ? "uk" : "en"),
                english ? "Українська версія" : "English version"));
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale + "/route-planner",
                english ? "Route planner" : "Планувальник маршрутів"));
        for (CityRouteCatalog.CityRoute route : cityRouteService.all()) {
            links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale + "/route/" + route.slug(),
                    cityName(route.from(), english) + " → " + cityName(route.to(), english)));
        }
        return noscriptBlock(h1, paragraphs, links);
    }

    private String routePlannerNoscript(boolean english, String locale) {
        String h1 = english
                ? "Map Route Planner with Fuel Prices & Weather"
                : "Планувальник маршруту з пальним і погодою";
        List<String> paragraphs = List.of(english
                ? "Plan a multi-stop road trip on the map, see live fuel prices by country and the weather along your route, and ask the AI trip assistant for help."
                : "Плануйте маршрут із кількома зупинками на карті, дивіться актуальні ціни на пальне по країнах і погоду в дорозі, а AI-асистент допоможе з деталями.");

        List<NoscriptLink> links = new ArrayList<>();
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + (english ? "uk" : "en") + "/route-planner",
                english ? "Українська версія" : "English version"));
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale, english ? "Home" : "Головна"));
        for (CityRouteCatalog.CityRoute route : cityRouteService.all().stream().limit(5).toList()) {
            links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale + "/route/" + route.slug(),
                    cityName(route.from(), english) + " → " + cityName(route.to(), english)));
        }
        return noscriptBlock(h1, paragraphs, links);
    }

    private String cityRouteNoscript(boolean english, String locale, String slug,
                                      String fromName, String toName,
                                      double distanceKm, double durationMin,
                                      Double totalCost, Double perPassenger,
                                      List<Map<String, Object>> related) {
        String h1 = fromName + " → " + toName;
        String distance = Math.round(distanceKm) + (english ? " km" : " км");
        String duration = english ? formatDurationEn(durationMin) : formatDurationUk(durationMin);
        String facts;
        if (totalCost != null && perPassenger != null) {
            facts = english
                    ? "Distance: " + distance + " (" + duration + "). Estimated fuel cost: " + formatMoneyEn(totalCost)
                            + ", " + formatMoneyEn(perPassenger) + " per passenger (4 passengers, 7.5 L/100km petrol)."
                    : "Відстань: " + distance + " (" + duration + "). Орієнтовна вартість пального: " + formatMoneyUk(totalCost)
                            + ", по " + formatMoneyUk(perPassenger) + " на пасажира (4 пасажири, 7.5 л/100км, бензин).";
        } else {
            facts = english
                    ? "Distance: " + distance + " (" + duration + "). Calculate the exact fuel cost and split it between passengers on the site."
                    : "Відстань: " + distance + " (" + duration + "). Розрахуйте точну вартість пального та поділіть її між пасажирами на сайті.";
        }
        List<String> paragraphs = List.of(
                english
                        ? "Free trip cost calculator for the " + fromName + " to " + toName + " road trip: real driving distance, live fuel price, and a per-passenger split."
                        : "Безкоштовний калькулятор вартості поїздки " + fromName + " – " + toName + ": реальна відстань, актуальна ціна на пальне та поділ витрат між пасажирами.",
                facts);

        List<NoscriptLink> links = new ArrayList<>();
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + (english ? "uk" : "en") + "/route/" + slug,
                english ? "Українська версія" : "English version"));
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale, english ? "Home" : "Головна"));
        links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale + "/route-planner",
                english ? "Route planner" : "Планувальник маршрутів"));
        if (related != null) {
            for (Map<String, Object> other : related) {
                links.add(new NoscriptLink(SITE_ORIGIN + "/" + locale + "/route/" + other.get("slug"),
                        other.get("fromName") + " → " + other.get("toName")));
            }
        }
        return noscriptBlock(h1, paragraphs, links);
    }

    private static String cityName(CityRouteCatalog.City city, boolean english) {
        return english ? city.en() : city.uk();
    }

    private static String esc(String value) {
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }

    // ------------------------------------------------------------------
    // Formatting helpers
    // ------------------------------------------------------------------

    private static String formatDurationUk(double minutesRaw) {
        long total = Math.round(minutesRaw);
        long hours = total / 60;
        long minutes = total % 60;
        if (hours > 0) {
            return hours + " год" + (minutes > 0 ? " " + minutes + " хв" : "");
        }
        return minutes + " хв";
    }

    private static String formatDurationEn(double minutesRaw) {
        long total = Math.round(minutesRaw);
        long hours = total / 60;
        long minutes = total % 60;
        if (hours > 0) {
            return hours + "h" + (minutes > 0 ? " " + minutes + "m" : "");
        }
        return minutes + "m";
    }

    private static String formatMoneyUk(double value) {
        return groupThousands(Math.round(value)) + " грн";
    }

    private static String formatMoneyEn(double value) {
        return groupThousands(Math.round(value)) + " UAH";
    }

    private static String groupThousands(long value) {
        String digits = Long.toString(value);
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (int i = digits.length() - 1; i >= 0; i--) {
            sb.append(digits.charAt(i));
            count++;
            if (count % 3 == 0 && i != 0) {
                sb.append(' ');
            }
        }
        return sb.reverse().toString();
    }

    // ------------------------------------------------------------------
    // HTML template assembly
    // ------------------------------------------------------------------

    private String injectLanguage(String template, String locale) {
        return HTML_LANG.matcher(template)
                .replaceFirst(Matcher.quoteReplacement("<html lang=\"" + locale + "\""));
    }

    private String injectMetadata(String template, PageMetadata metadata) {
        String html = injectLanguage(template, metadata.locale);
        html = TITLE.matcher(html).replaceFirst("$1" + Matcher.quoteReplacement(metadata.title) + "$2");
        html = replaceMeta(html, "name", "description", metadata.description);
        html = replaceMeta(html, "property", "og:title", metadata.ogTitle);
        html = replaceMeta(html, "property", "og:description", metadata.description);
        html = replaceMeta(html, "property", "og:url", metadata.canonicalUrl());
        boolean english = "en".equals(metadata.locale);
        html = replaceMeta(html, "property", "og:locale", english ? "en_GB" : "uk_UA");
        html = replaceMeta(html, "property", "og:locale:alternate", english ? "uk_UA" : "en_GB");
        html = replaceMeta(html, "property", "og:site_name", "Trip Calculate");
        html = replaceMeta(html, "property", "og:image:alt", english
                ? "Trip Calculate: fuel costs for any road trip, split fairly."
                : "Trip Calculate: витрати на пальне для будь-якої поїздки, поділені чесно.");

        html = html.replaceAll("(?is)\\s*<link\\s+rel=\"(?:canonical|alternate)\"[^>]*>", "");
        String alternates = "\n    <link rel=\"canonical\" href=\"" + metadata.canonicalUrl() + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"en\" href=\"" + metadata.alternateUrl("en") + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"uk\" href=\"" + metadata.alternateUrl("uk") + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"x-default\" href=\"" + metadata.defaultUrl() + "\" />\n  ";
        String jsonLd = metadata.jsonLd != null ? metadata.jsonLd : "";
        html = html.replace("</head>", alternates + jsonLd + "\n  </head>");

        if (metadata.noscript != null) {
            html = html.replace("<div id=\"root\"></div>", "<div id=\"root\"></div>" + metadata.noscript);
        }
        return html;
    }

    private String replaceMeta(String html, String attribute, String key, String content) {
        Pattern pattern = Pattern.compile("(?is)<meta\\s+" + attribute + "=\""
                + Pattern.quote(key) + "\"[^>]*>");
        String tag = "<meta " + attribute + "=\"" + key + "\" content=\"" + content + "\" />";
        Matcher matcher = pattern.matcher(html);
        if (matcher.find()) {
            return matcher.replaceFirst(Matcher.quoteReplacement(tag));
        }
        return html.replace("</head>", "    " + tag + "\n  </head>");
    }

    private record PageMetadata(
            String locale,
            String routePath,
            String title,
            String description,
            String ogTitle,
            boolean indexable,
            String jsonLd,
            String noscript) {

        private static PageMetadata notIndexable(String locale) {
            return new PageMetadata(locale, "", "", "", "", false, null, null);
        }

        private String canonicalUrl() {
            return SITE_ORIGIN + "/" + locale + routePath;
        }

        private String alternateUrl(String targetLocale) {
            return SITE_ORIGIN + "/" + targetLocale + routePath;
        }

        private String defaultUrl() {
            // City routes have no bare locale-resolving URL (LocaleRedirectController
            // only maps "/" and "/route-planner"), so their x-default is the uk page,
            // matching sitemap.xml.
            if (routePath.startsWith("/route/")) {
                return alternateUrl("uk");
            }
            // Legal pages: English is the version for everyone else (owner decision).
            if (routePath.equals("/privacy") || routePath.equals("/terms")) {
                return alternateUrl("en");
            }
            return routePath.isEmpty() ? SITE_ORIGIN + "/" : SITE_ORIGIN + routePath;
        }
    }

    private String template() throws IOException {
        String cached = indexTemplate;
        if (cached == null) {
            cached = StreamUtils.copyToString(
                    new ClassPathResource("static/index.html").getInputStream(),
                    StandardCharsets.UTF_8);
            indexTemplate = cached;
        }
        return cached;
    }
}
