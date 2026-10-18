package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class LoginReturnToTest {

    @ParameterizedTest
    @ValueSource(strings = {"/en", "/uk", "/en/route-planner", "/uk/dashboard",
            "/en/route/kyiv-lviv", "/en/route-planner?from=Kyiv&to=Lviv", "/en#x"})
    void acceptsLocalePrefixedAppPaths(String path) {
        assertEquals(path, LoginReturnTo.sanitize(path));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://evil.com", "//evil.com", "/\\evil.com", "/en//evil.com",
            "/de/route-planner", "/enx", "route-planner", "/en/../admin", "/en/a b", "/admin", ""})
    void rejectsAnythingElse(String path) {
        assertNull(LoginReturnTo.sanitize(path));
    }

    @Test
    void captureThenConsumeReturnsPathOnce() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("returnTo", "/en/route-planner");
        LoginReturnTo.capture(request);
        assertEquals("/en/route-planner", LoginReturnTo.consume(request));
        assertNull(LoginReturnTo.consume(request));
    }

    @Test
    void captureIgnoresUnsafeValue() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("returnTo", "https://evil.com");
        LoginReturnTo.capture(request);
        assertNull(LoginReturnTo.consume(request));
    }
}
