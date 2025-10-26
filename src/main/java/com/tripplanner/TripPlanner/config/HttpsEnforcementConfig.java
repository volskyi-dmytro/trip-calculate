package com.tripplanner.TripPlanner.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Force HTTPS scheme for all requests when behind Cloudflare proxy.
 * This ensures OAuth2 and other redirects use https:// instead of http://
 */
@Configuration
public class HttpsEnforcementConfig {

    @Bean
    public OncePerRequestFilter httpsEnforcementFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                          HttpServletResponse response,
                                          FilterChain filterChain) throws ServletException, IOException {

                // Check for X-Forwarded-* headers from Cloudflare
                String forwardedProto = request.getHeader("X-Forwarded-Proto");
                String forwardedHost = request.getHeader("X-Forwarded-Host");

                // If behind proxy with HTTPS, wrap request to return https scheme
                if ("https".equalsIgnoreCase(forwardedProto)) {
                    HttpServletRequest finalRequest = request;
                    request = new HttpServletRequestWrapper(request) {
                        @Override
                        public String getScheme() {
                            return "https";
                        }

                        @Override
                        public boolean isSecure() {
                            return true;
                        }

                        @Override
                        public int getServerPort() {
                            return 443;
                        }

                        @Override
                        public String getServerName() {
                            // Use X-Forwarded-Host if available, otherwise use original
                            return forwardedHost != null ? forwardedHost : finalRequest.getServerName();
                        }

                        @Override
                        public StringBuffer getRequestURL() {
                            StringBuffer url = new StringBuffer();
                            String scheme = getScheme();
                            int port = getServerPort();
                            String serverName = getServerName();

                            url.append(scheme).append("://").append(serverName);
                            if ((scheme.equals("https") && port != 443) ||
                                (scheme.equals("http") && port != 80)) {
                                url.append(':').append(port);
                            }
                            url.append(getRequestURI());

                            return url;
                        }
                    };
                }

                filterChain.doFilter(request, response);
            }
        };
    }
}
