package com.tripplanner.TripPlanner.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClientIpResolverTest {

    private final ClientIpResolver resolver = new ClientIpResolver();

    private static MockHttpServletRequest from(String peer) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(peer);
        return request;
    }

    @Test
    void usesCfConnectingIpWhenTheRequestComesFromCloudflare() {
        MockHttpServletRequest request = from("162.158.1.20"); // Cloudflare edge
        request.addHeader("CF-Connecting-IP", "203.0.113.7");

        assertEquals("203.0.113.7", resolver.resolve(request));
    }

    @Test
    void trustsCfConnectingIpFromDockerGatewayAndIpv6CloudflareEdges() {
        MockHttpServletRequest docker = from("172.18.0.1");
        docker.addHeader("CF-Connecting-IP", "203.0.113.8");
        assertEquals("203.0.113.8", resolver.resolve(docker));

        MockHttpServletRequest v6 = from("2606:4700:10::ac43:1");
        v6.addHeader("CF-Connecting-IP", "2001:db8::5");
        assertEquals("2001:db8::5", resolver.resolve(v6));
    }

    @Test
    void ignoresClientSuppliedHeadersFromAnUntrustedPeer() {
        // Someone reaching the origin directly can't choose their own IP.
        MockHttpServletRequest request = from("198.51.100.9");
        request.addHeader("CF-Connecting-IP", "127.0.0.1");
        request.addHeader("X-Forwarded-For", "127.0.0.1");

        assertEquals("198.51.100.9", resolver.resolve(request));
    }

    @Test
    void neverTrustsXForwardedForEvenFromCloudflare() {
        // Cloudflare appends to X-Forwarded-For, so its first value is whatever the client sent.
        MockHttpServletRequest request = from("162.158.1.20");
        request.addHeader("X-Forwarded-For", "127.0.0.1, 203.0.113.7");

        assertEquals("162.158.1.20", resolver.resolve(request));
    }

    @Test
    void rejectsGarbageInCfConnectingIp() {
        MockHttpServletRequest request = from("162.158.1.20");
        request.addHeader("CF-Connecting-IP", "not-an-ip<script>");

        assertEquals("162.158.1.20", resolver.resolve(request));
    }

    @Test
    void readsTheRealSocketPeerThroughRequestWrappers() {
        // ForwardedHeaderFilter wraps the request and reports X-Forwarded-For as the remote address.
        MockHttpServletRequest raw = from("198.51.100.9");
        HttpServletRequest spoofed = new HttpServletRequestWrapper(raw) {
            @Override
            public String getRemoteAddr() {
                return "127.0.0.1";
            }
        };

        assertEquals("198.51.100.9", resolver.resolve(spoofed));
        assertFalse(resolver.isLocalRequest(spoofed));
    }

    @Test
    void localRequestMeansTheSocketItselfIsLoopback() {
        assertTrue(resolver.isLocalRequest(from("127.0.0.1")));
        assertTrue(resolver.isLocalRequest(from("0:0:0:0:0:0:0:1")));

        MockHttpServletRequest viaDocker = from("172.18.0.1");
        viaDocker.addHeader("CF-Connecting-IP", "127.0.0.1");
        assertFalse(resolver.isLocalRequest(viaDocker));
    }

    @Test
    void hexWordHostnamesAreNotResolvedThroughDns() {
        // "cafe.babe.dead.beef" looks like hex; it must be rejected, not looked up.
        MockHttpServletRequest request = from("162.158.1.20");
        request.addHeader("CF-Connecting-IP", "cafe.babe.dead.beef");

        assertEquals("162.158.1.20", resolver.resolve(request));
    }

    @Test
    void aLoopbackConnectionCarryingProxyHeadersIsNotLocal() {
        // A reverse proxy on the same host would forward every visitor over loopback.
        MockHttpServletRequest proxied = from("127.0.0.1");
        proxied.addHeader("CF-Connecting-IP", "203.0.113.7");
        assertFalse(resolver.isLocalRequest(proxied));

        MockHttpServletRequest forwarded = from("127.0.0.1");
        forwarded.addHeader("X-Forwarded-For", "203.0.113.7");
        assertFalse(resolver.isLocalRequest(forwarded));
    }
}
