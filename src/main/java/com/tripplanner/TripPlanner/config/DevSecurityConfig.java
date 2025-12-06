package com.tripplanner.TripPlanner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Development-only security configuration that disables authentication.
 * This allows frontend development without OAuth complexity.
 * Only active when spring.profiles.active=dev
 */
@Configuration
@EnableWebSecurity
@Profile("dev")
public class DevSecurityConfig {

    @Bean
    public SecurityFilterChain devFilterChain(HttpSecurity http) throws Exception {
        http
            // Disable CSRF for dev (simplifies testing)
            .csrf(csrf -> csrf.disable())

            // Disable frame options to allow H2 console
            .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.disable()))

            // Permit all requests - no authentication required
            .authorizeHttpRequests(auth -> auth
                .anyRequest().permitAll()
            )

            // Disable form login
            .formLogin(form -> form.disable())

            // Disable HTTP Basic
            .httpBasic(basic -> basic.disable())

            // Disable OAuth2 login
            .oauth2Login(oauth2 -> oauth2.disable());

        return http.build();
    }
}
