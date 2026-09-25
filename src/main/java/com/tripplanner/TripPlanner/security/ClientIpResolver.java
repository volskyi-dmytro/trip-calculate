package com.tripplanner.TripPlanner.security;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The one place that decides which IP address a request comes from, for rate
 * limiting and logs.
 *
 * <p>The app sits directly behind Cloudflare, so the TCP peer is a Cloudflare
 * edge (or Docker's gateway when Docker proxies the published port). Only then
 * is Cloudflare's {@code CF-Connecting-IP} header trusted. {@code X-Forwarded-For}
 * is never trusted: Cloudflare appends to it, so its first value is whatever the
 * client sent. Anyone reaching the origin directly is identified by their real
 * socket address.
 */
public class ClientIpResolver {

    private static final String CF_CONNECTING_IP = "CF-Connecting-IP";

    // Declared before TRUSTED_PROXIES, which parses with them.
    // Literal addresses only, so InetAddress never does a DNS lookup:
    // dotted-decimal IPv4, or IPv6 (hex groups with at least one colon).
    private static final Pattern IPV4_LITERAL = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");
    private static final Pattern IPV6_LITERAL = Pattern.compile("^[0-9a-fA-F:.]*:[0-9a-fA-F:.]*$");

    // Cloudflare edge ranges (https://www.cloudflare.com/ips/) plus loopback and
    // private networks (Docker bridge gateway, same-host callers).
    private static final List<Cidr> TRUSTED_PROXIES = List.of(
            // Cloudflare IPv4
            Cidr.of("173.245.48.0/20"), Cidr.of("103.21.244.0/22"), Cidr.of("103.22.200.0/22"),
            Cidr.of("103.31.4.0/22"), Cidr.of("141.101.64.0/18"), Cidr.of("108.162.192.0/18"),
            Cidr.of("190.93.240.0/20"), Cidr.of("188.114.96.0/20"), Cidr.of("197.234.240.0/22"),
            Cidr.of("198.41.128.0/17"), Cidr.of("162.158.0.0/15"), Cidr.of("104.16.0.0/13"),
            Cidr.of("104.24.0.0/14"), Cidr.of("172.64.0.0/13"), Cidr.of("131.0.72.0/22"),
            // Cloudflare IPv6
            Cidr.of("2400:cb00::/32"), Cidr.of("2606:4700::/32"), Cidr.of("2803:f800::/32"),
            Cidr.of("2405:b500::/32"), Cidr.of("2405:8100::/32"), Cidr.of("2a06:98c0::/29"),
            Cidr.of("2c0f:f248::/32"),
            // Loopback and private networks
            Cidr.of("127.0.0.0/8"), Cidr.of("::1/128"), Cidr.of("10.0.0.0/8"),
            Cidr.of("172.16.0.0/12"), Cidr.of("192.168.0.0/16"), Cidr.of("fc00::/7"));

    /** The client's IP address, as far as it can be trusted. */
    public String resolve(HttpServletRequest request) {
        String peer = socketPeer(request);
        if (isTrustedProxy(peer)) {
            String forwarded = request.getHeader(CF_CONNECTING_IP);
            if (forwarded != null && parse(forwarded.trim()) != null) {
                return forwarded.trim();
            }
        }
        return peer;
    }

    /**
     * True only for a request made on this machine itself (health checks): a
     * loopback connection that carries no proxy headers. A reverse proxy on the
     * same host would forward every visitor over loopback, with those headers.
     */
    public boolean isLocalRequest(HttpServletRequest request) {
        if (request.getHeader(CF_CONNECTING_IP) != null || request.getHeader("X-Forwarded-For") != null) {
            return false;
        }
        InetAddress peer = parse(socketPeer(request));
        return peer != null && peer.isLoopbackAddress();
    }

    // Filters such as Spring's ForwardedHeaderFilter wrap the request and report
    // X-Forwarded-For as the remote address; the innermost request is Tomcat's own.
    private static String socketPeer(ServletRequest request) {
        ServletRequest current = request;
        while (current instanceof ServletRequestWrapper wrapper) {
            current = wrapper.getRequest();
        }
        return current.getRemoteAddr();
    }

    private static boolean isTrustedProxy(String address) {
        InetAddress ip = parse(address);
        return ip != null && TRUSTED_PROXIES.stream().anyMatch(cidr -> cidr.contains(ip));
    }

    private static InetAddress parse(String value) {
        if (value == null || value.length() > 45
                || !(IPV4_LITERAL.matcher(value).matches() || IPV6_LITERAL.matcher(value).matches())) {
            return null;
        }
        try {
            return InetAddress.getByName(value);
        } catch (UnknownHostException e) {
            return null;
        }
    }

    private record Cidr(byte[] network, int prefix) {

        static Cidr of(String notation) {
            String[] parts = notation.split("/");
            InetAddress address = parse(parts[0]);
            if (address == null) {
                throw new IllegalArgumentException("Bad CIDR: " + notation);
            }
            return new Cidr(address.getAddress(), Integer.parseInt(parts[1]));
        }

        boolean contains(InetAddress ip) {
            byte[] candidate = ip.getAddress();
            if (candidate.length != network.length) {
                return false;
            }
            int fullBytes = prefix / 8;
            for (int i = 0; i < fullBytes; i++) {
                if (candidate[i] != network[i]) {
                    return false;
                }
            }
            int remainingBits = prefix % 8;
            if (remainingBits == 0) {
                return true;
            }
            int mask = (0xFF << (8 - remainingBits)) & 0xFF;
            return (candidate[fullBytes] & mask) == (network[fullBytes] & mask);
        }
    }
}
