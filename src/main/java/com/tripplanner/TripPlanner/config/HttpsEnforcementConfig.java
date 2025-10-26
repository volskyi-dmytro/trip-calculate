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

                // Check for X-Forwarded-Proto header from Cloudflare
                String forwardedProto = request.getHeader("X-Forwarded-Proto");

                // If behind proxy with HTTPS, wrap request to return https scheme
                if ("https".equalsIgnoreCase(forwardedProto)) {
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
                        public StringBuffer getRequestURL() {
                            StringBuffer url = new StringBuffer();
                            String scheme = getScheme();
                            int port = getServerPort();

                            url.append(scheme).append("://").append(getServerName());
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
