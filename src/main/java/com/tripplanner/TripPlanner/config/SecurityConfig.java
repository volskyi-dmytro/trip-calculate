package com.tripplanner.TripPlanner.config;

import com.tripplanner.TripPlanner.security.CustomOAuth2UserService;
import com.tripplanner.TripPlanner.security.CustomOidcUserService;
import com.tripplanner.TripPlanner.security.OAuth2LoginSuccessHandler;
import com.tripplanner.TripPlanner.security.OAuth2LogoutSuccessHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    private final OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;
    private final OAuth2LogoutSuccessHandler oAuth2LogoutSuccessHandler;
    private final ClientRegistrationRepository clientRegistrationRepository;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final CustomOidcUserService customOidcUserService;

    public SecurityConfig(OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler,
                         OAuth2LogoutSuccessHandler oAuth2LogoutSuccessHandler,
                         ClientRegistrationRepository clientRegistrationRepository,
                         CustomOAuth2UserService customOAuth2UserService,
                         CustomOidcUserService customOidcUserService) {
        this.oAuth2LoginSuccessHandler = oAuth2LoginSuccessHandler;
        this.oAuth2LogoutSuccessHandler = oAuth2LogoutSuccessHandler;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.customOAuth2UserService = customOAuth2UserService;
        this.customOidcUserService = customOidcUserService;

        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("========================================");
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("SecurityConfig injected with CustomOidcUserService: {}",
            customOidcUserService != null ? customOidcUserService.getClass().getName() : "NULL");
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("========================================");
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        OAuth2AuthorizationRequestResolver authorizationRequestResolver =
                buildAuthorizationRequestResolver();

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
                        .authorizationEndpoint(auth -> auth.authorizationRequestResolver(authorizationRequestResolver))
                        // Google uses OIDC - configure OIDC user service to load roles from database
                        .userInfoEndpoint(userInfo -> userInfo.oidcUserService(customOidcUserService))
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

                        // Admin API endpoints (role-based access via @PreAuthorize)
                        .requestMatchers("/api/admin/**").authenticated()

                        // API endpoints for authenticated users
                        .requestMatchers("/api/user/**", "/api/trips/**").authenticated()
                        .requestMatchers("/api/routes/**", "/api/access-requests/**").authenticated()

                        // Allow health endpoint for monitoring, block other actuator endpoints
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/actuator/**").denyAll()

                        // Block dangerous paths - CRITICAL SECURITY
                        .requestMatchers("/.git/**", "/.env", "/config/**", "/.aws/**",
                                "/.ssh/**", "/backup/**").denyAll()

                        // Deny everything else by default
                        .anyRequest().denyAll()
                );

        return http.build();
    }

    private OAuth2AuthorizationRequestResolver buildAuthorizationRequestResolver() {
        DefaultOAuth2AuthorizationRequestResolver resolver =
                new DefaultOAuth2AuthorizationRequestResolver(clientRegistrationRepository, "/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(customizer ->
                customizer.additionalParameters(params -> params.put("prompt", "login")));
        return resolver;
    }
}
