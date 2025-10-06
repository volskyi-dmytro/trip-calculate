package com.tripplanner.TripPlanner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
@EnableJdbcHttpSession(maxInactiveIntervalInSeconds = 86400) // 24 hours
public class SessionConfig {

    /**
     * Production cookie serializer (HTTPS only)
     */
    @Bean
    @Profile("!dev") // Active for all profiles except dev
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSIONID");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(true); // HTTPS only in production
        serializer.setSameSite("Lax");
        serializer.setCookiePath("/");
        serializer.setCookieMaxAge(86400); // 24 hours
        return serializer;
    }

    /**
     * Development cookie serializer (allows HTTP)
     */
    @Bean
    @Profile("dev")
    public CookieSerializer devCookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSIONID");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(false); // Allow HTTP in development
        serializer.setSameSite("Lax");
        serializer.setCookiePath("/");
        serializer.setCookieMaxAge(86400);
        return serializer;
    }
}
