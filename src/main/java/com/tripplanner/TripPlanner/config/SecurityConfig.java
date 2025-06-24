package com.tripplanner.TripPlanner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Disable CSRF for API endpoints (you can enable it if needed)
                .csrf(csrf -> csrf.disable())

                // Configure headers for security
                .headers(headers -> headers
                        .frameOptions(frameOptions -> frameOptions.deny())
                        // .contentTypeOptions() removed as it is deprecated and enabled by default in Spring Security 6.1+
                        .httpStrictTransportSecurity(hstsConfig -> hstsConfig
                                .maxAgeInSeconds(31536000)
                                .includeSubDomains(true)
                        )
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                )

                // Allow all requests for now (you can restrict later)
                .authorizeHttpRequests(authz -> authz
                        .requestMatchers(
                            "/", "/calculate", "/css/**", "/js/**", "/images/**", "/*.ico",
                            "/script.js", "/styles.css",
                            "/webjars/**", "/static/**", "/public/**", "/resources/**"
                        ).permitAll()
                        .anyRequest().permitAll() // Deny any other requests
                );

        return http.build();
    }
}
