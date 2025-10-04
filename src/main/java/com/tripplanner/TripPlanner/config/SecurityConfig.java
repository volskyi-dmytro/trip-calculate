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
                        .httpStrictTransportSecurity(hstsConfig -> hstsConfig.maxAgeInSeconds(31536000).includeSubDomains(true))
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                )

                // Allow all requests for now (you can restrict later)
                .authorizeHttpRequests(authz -> authz
                        // Allow legitimate resources first
                        .requestMatchers("/", "/index.html", "/calculate").permitAll()
                        .requestMatchers("/css/**", "/js/**", "/images/**", "/webjars/**", "/static/**", "/public/**", "/resources/**").permitAll()
                        .requestMatchers("/styles.css", "/script.js", "/site.webmanifest", "/*.ico", "/*.png", "/*.webp", "/*.jpg", "/*.gif").permitAll()
                        .requestMatchers("/error").permitAll()

                        // Block dangerous paths - CRITICAL SECURITY (simplified patterns)
                        .requestMatchers("/.git/**", "/.env", "/config/**", "/.aws/**", "/.ssh/**", "/backup/**", "/admin/**", "/actuator/**").denyAll()

                        // Deny everything else by default
                        .anyRequest().denyAll()
                );

        return http.build();
    }
}
