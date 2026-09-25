package com.tripplanner.TripPlanner.filter;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CanonicalUrlFilterTest {

    private final CanonicalUrlFilter filter = new CanonicalUrlFilter();

    @Test
    void redirectsWwwHostToApexPreservingPathAndQuery() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/en/route-planner");
        request.setServerName("www.trip-calculate.online");
        request.setQueryString("from=bookmark");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.PERMANENT_REDIRECT.value(), response.getStatus());
        assertEquals("https://trip-calculate.online/en/route-planner?from=bookmark", response.getHeader("Location"));
        assertEquals(null, chain.getRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/en/", "/uk/", "/en/route-planner/", "/uk/route-planner/",
            "/en/privacy/", "/uk/privacy/", "/en/terms/", "/uk/terms/"})
    void redirectsEveryLocalizedPublicTrailingSlashToCanonicalPath(String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.addHeader("Host", "trip-calculate.online");
        request.setQueryString("from=bookmark");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.PERMANENT_REDIRECT.value(), response.getStatus());
        assertEquals(path.substring(0, path.length() - 1) + "?from=bookmark", response.getHeader("Location"));
        assertEquals(null, chain.getRequest());
    }

    @Test
    void redirectsIndexHtmlToRootWithMovedPermanently() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/index.html");
        request.addHeader("Host", "trip-calculate.online");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.MOVED_PERMANENTLY.value(), response.getStatus());
        assertEquals("/", response.getHeader("Location"));
        assertEquals(null, chain.getRequest());
    }

    @Test
    void redirectsHeadIndexHtmlToRootPreservingQuery() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("HEAD", "/index.html");
        request.setQueryString("utm_source=x");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.MOVED_PERMANENTLY.value(), response.getStatus());
        assertEquals("/?utm_source=x", response.getHeader("Location"));
    }

    @Test
    void redirectsWwwIndexHtmlStraightToApexRootInOneHop() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/index.html");
        request.setServerName("www.trip-calculate.online");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.MOVED_PERMANENTLY.value(), response.getStatus());
        assertEquals("https://trip-calculate.online/", response.getHeader("Location"));
    }

    @Test
    void doesNotRedirectUnsafeMethodsAcrossHosts() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/routes");
        request.setServerName("www.trip-calculate.online");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertEquals(request, chain.getRequest());
    }
}
