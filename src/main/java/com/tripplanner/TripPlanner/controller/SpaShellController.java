package com.tripplanner.TripPlanner.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serves the SPA shell for locale-prefixed app routes ("/en", "/uk",
 * "/en/route-planner", etc.) so React Router can take over client-side.
 * Indexable routes receive localized, route-specific metadata before the
 * browser executes JavaScript, giving crawlers unambiguous canonical and
 * language-alternate signals.
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

    private volatile String indexTemplate;

    @GetMapping({"/en", "/en/**", "/uk", "/uk/**"})
    public ResponseEntity<String> shell(HttpServletRequest request) throws IOException {
        PageMetadata metadata = PageMetadata.forPath(request.getRequestURI());
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

        html = html.replaceAll("(?is)\\s*<link\\s+rel=\"(?:canonical|alternate)\"[^>]*>", "");
        String alternates = "\n    <link rel=\"canonical\" href=\"" + metadata.canonicalUrl() + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"en\" href=\"" + metadata.alternateUrl("en") + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"uk\" href=\"" + metadata.alternateUrl("uk") + "\" />"
                + "\n    <link rel=\"alternate\" hreflang=\"x-default\" href=\"" + metadata.defaultUrl() + "\" />\n  ";
        return html.replace("</head>", alternates + "</head>");
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
            boolean indexable) {

        private static PageMetadata forPath(String requestPath) {
            boolean english = requestPath.equals("/en") || requestPath.startsWith("/en/");
            String locale = english ? "en" : "uk";
            String localeRoot = "/" + locale;
            boolean home = requestPath.equals(localeRoot) || requestPath.equals(localeRoot + "/");
            boolean routePlanner = requestPath.equals(localeRoot + "/route-planner")
                    || requestPath.equals(localeRoot + "/route-planner/");
            String routePath = routePlanner ? "/route-planner" : "";

            if (!home && !routePlanner) {
                return new PageMetadata(locale, "", "", "", "", false);
            }
            if (routePlanner && english) {
                return new PageMetadata(
                        locale,
                        routePath,
                        "Multi-Stop Route Planner &amp; Fuel Cost Calculator | Trip Calculate",
                        "Plan a multi-stop road trip with real driving distances and times, estimate fuel costs, and export the route to Waze.",
                        "Multi-Stop Route Planner | Trip Calculate",
                        true);
            }
            if (routePlanner) {
                return new PageMetadata(
                        locale,
                        routePath,
                        "Планувальник маршрутів і витрат на пальне | Trip Calculate",
                        "Плануйте автомобільні маршрути з кількома зупинками, розраховуйте відстань, час і витрати на пальне та експортуйте маршрут у Waze.",
                        "Планувальник маршрутів | Trip Calculate",
                        true);
            }
            if (english) {
                return new PageMetadata(
                        locale,
                        routePath,
                        "Trip Cost Calculator &amp; Route Planner | Trip Calculate",
                        "Calculate road-trip fuel costs, split expenses between passengers, and plan routes using real driving distances. Free and easy to use.",
                        "Trip Cost Calculator | Trip Calculate",
                        true);
            }
            return new PageMetadata(
                    locale,
                    routePath,
                    "Калькулятор вартості поїздки та пального | Trip Calculate",
                    "Розрахуйте витрати на пальне для автомобільної поїздки, поділіть суму між пасажирами та сплануйте маршрут за реальною відстанню.",
                    "Калькулятор вартості поїздки | Trip Calculate",
                    true);
        }

        private String canonicalUrl() {
            return SITE_ORIGIN + "/" + locale + routePath;
        }

        private String alternateUrl(String targetLocale) {
            return SITE_ORIGIN + "/" + targetLocale + routePath;
        }

        private String defaultUrl() {
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
