package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.service.LocaleResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LocaleRedirectControllerTest {

    private LocaleResolver localeResolver;
    private LocaleRedirectController controller;

    @BeforeEach
    void setUp() {
        localeResolver = mock(LocaleResolver.class);
        controller = new LocaleRedirectController(localeResolver);
    }

    @Test
    void redirectsRootToResolvedLocale() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/");
        when(localeResolver.resolve("en-US,en;q=0.9")).thenReturn("en");
        request.addHeader(HttpHeaders.ACCEPT_LANGUAGE, "en-US,en;q=0.9");

        ResponseEntity<Void> response = controller.redirectToLocale(request);

        assertEquals(302, response.getStatusCode().value());
        assertEquals("/en", response.getHeaders().getLocation().toString());
    }

    @Test
    void redirectsLegacyRoutePlannerPathPreservingIt() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/route-planner");
        when(localeResolver.resolve(null)).thenReturn("uk");

        ResponseEntity<Void> response = controller.redirectToLocale(request);

        assertEquals("/uk/route-planner", response.getHeaders().getLocation().toString());
    }

    @Test
    void preservesQueryString() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dashboard");
        request.setQueryString("tab=routes");
        when(localeResolver.resolve(null)).thenReturn("en");

        ResponseEntity<Void> response = controller.redirectToLocale(request);

        assertEquals("/en/dashboard?tab=routes", response.getHeaders().getLocation().toString());
    }
}
