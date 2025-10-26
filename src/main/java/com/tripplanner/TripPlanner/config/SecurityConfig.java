package com.tripplanner.TripPlanner.config;

import com.tripplanner.TripPlanner.security.OAuth2LoginSuccessHandler;
import com.tripplanner.TripPlanner.security.OAuth2LogoutSuccessHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;
    private final OAuth2LogoutSuccessHandler oAuth2LogoutSuccessHandler;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        // Configure CSRF token handler for proper token loading
        CsrfTokenRequestAttributeHandler requestHandler = new CsrfTokenRequestAttributeHandler();
        requestHandler.setCsrfRequestAttributeName("_csrf");

        http
                // Enable CSRF protection (OAuth2 requires it)
                .csrf(csrf -> csrf
                        // Disable CSRF only for public API endpoints
                        .ignoringRequestMatchers("/calculate")
                        // Use cookie-based CSRF tokens for JavaScript access
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // Set token handler to ensure tokens are loaded
                        .csrfTokenRequestHandler(requestHandler)
                )

                // Configure headers for security
                .headers(headers -> headers
                        .frameOptions(frameOptions -> frameOptions.deny())
                        .httpStrictTransportSecurity(hstsConfig -> hstsConfig
                                .maxAgeInSeconds(31536000)
                                .includeSubDomains(true))
                        .referrerPolicy(referrer -> referrer
                                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                )

                // Configure OAuth2 login
                .oauth2Login(oauth2 -> oauth2
                        .loginPage("/oauth2/authorization/google")
                        .successHandler(oAuth2LoginSuccessHandler)
                        .failureUrl("/?error=auth_failed")
                )

                // Configure logout with custom handler
                .logout(logout -> logout
                        .logoutUrl("/logout")
                        .logoutSuccessHandler(oAuth2LogoutSuccessHandler)  // Custom handler for OAuth2 logout
                        .invalidateHttpSession(true)
                        .deleteCookies("JSESSIONID")
                        .clearAuthentication(true)
                )

                // Authorization rules
                .authorizeHttpRequests(authz -> authz
                        // Public resources
                        .requestMatchers("/", "/index.html", "/calculate").permitAll()
                        .requestMatchers("/css/**", "/js/**", "/images/**", "/webjars/**",
                                "/static/**", "/public/**", "/resources/**", "/assets/**").permitAll()
                        .requestMatchers("/styles.css", "/script.js", "/site.webmanifest", "/*.ico", "/*.png",
                                "/*.webp", "/*.jpg", "/*.gif", "/vite.svg").permitAll()
                        .requestMatchers("/error", "/oauth2/**", "/login/**").permitAll()

                        // Public API endpoints for auth status check, CSRF token, and avatar proxy
                        .requestMatchers("/api/user/me", "/api/user/status", "/api/user/csrf", "/api/avatar/proxy").permitAll()

                        // API endpoints for authenticated users
                        .requestMatchers("/api/user/**", "/api/trips/**").authenticated()

                        // Allow health endpoint for monitoring, block other actuator endpoints
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/actuator/**").denyAll()

                        // Block dangerous paths - CRITICAL SECURITY
                        .requestMatchers("/.git/**", "/.env", "/config/**", "/.aws/**",
                                "/.ssh/**", "/backup/**", "/admin/**").denyAll()

                        // Deny everything else by default
                        .anyRequest().denyAll()
                );

        return http.build();
    }
}
