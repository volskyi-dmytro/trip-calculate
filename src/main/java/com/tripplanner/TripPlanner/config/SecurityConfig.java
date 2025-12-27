package com.tripplanner.TripPlanner.config;

import com.tripplanner.TripPlanner.security.AuthorityRestoreFilter;
import com.tripplanner.TripPlanner.security.CustomOAuth2UserService;
import com.tripplanner.TripPlanner.security.CustomOidcUserService;
import com.tripplanner.TripPlanner.security.OAuth2LoginSuccessHandler;
import com.tripplanner.TripPlanner.security.OAuth2LogoutSuccessHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
@Profile("!dev")  // Only active when NOT in dev profile
public class SecurityConfig {

    private final OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;
    private final OAuth2LogoutSuccessHandler oAuth2LogoutSuccessHandler;
    private final ClientRegistrationRepository clientRegistrationRepository;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final CustomOidcUserService customOidcUserService;
    private final AuthorityRestoreFilter authorityRestoreFilter;

    public SecurityConfig(OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler,
                         OAuth2LogoutSuccessHandler oAuth2LogoutSuccessHandler,
                         ClientRegistrationRepository clientRegistrationRepository,
                         CustomOAuth2UserService customOAuth2UserService,
                         CustomOidcUserService customOidcUserService,
                         AuthorityRestoreFilter authorityRestoreFilter) {
        this.oAuth2LoginSuccessHandler = oAuth2LoginSuccessHandler;
        this.oAuth2LogoutSuccessHandler = oAuth2LogoutSuccessHandler;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.customOAuth2UserService = customOAuth2UserService;
        this.customOidcUserService = customOidcUserService;
        this.authorityRestoreFilter = authorityRestoreFilter;

        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("========================================");
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("SecurityConfig injected with CustomOidcUserService: {}",
            customOidcUserService != null ? customOidcUserService.getClass().getName() : "NULL");
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("SecurityConfig injected with AuthorityRestoreFilter: {}",
            authorityRestoreFilter != null ? authorityRestoreFilter.getClass().getName() : "NULL");
        org.slf4j.LoggerFactory.getLogger(SecurityConfig.class).info("========================================");
    }

    @Bean
    public com.tripplanner.TripPlanner.filter.RateLimitingFilter rateLimitingFilter() {
        return new com.tripplanner.TripPlanner.filter.RateLimitingFilter();
    }

    @Bean
    public com.tripplanner.TripPlanner.filter.AiRateLimitingFilter aiRateLimitingFilter(
            com.tripplanner.TripPlanner.repository.UserRepository userRepository) {
        return new com.tripplanner.TripPlanner.filter.AiRateLimitingFilter(userRepository);
    }

    @Bean
    public com.tripplanner.TripPlanner.filter.AttackMitigationFilter attackMitigationFilter() {
        return new com.tripplanner.TripPlanner.filter.AttackMitigationFilter();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                          com.tripplanner.TripPlanner.repository.UserRepository userRepository) throws Exception {
        OAuth2AuthorizationRequestResolver authorizationRequestResolver =
                buildAuthorizationRequestResolver();

        // Configure CSRF token handler for proper token loading
        CsrfTokenRequestAttributeHandler requestHandler = new CsrfTokenRequestAttributeHandler();
        requestHandler.setCsrfRequestAttributeName("_csrf");

        http
                // Enable CSRF protection (OAuth2 requires it)
                .csrf(csrf -> csrf
                        // Disable CSRF only for public API endpoints
                        .ignoringRequestMatchers("/calculate", "/api/routing/**")
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

                // Add custom filter to restore authorities from database when session is restored
                // CRITICAL: Must run after SecurityContext is loaded but BEFORE authorization checks
                .addFilterAfter(authorityRestoreFilter, SecurityContextHolderFilter.class)

                // Add attack mitigation filter AFTER authority restoration to ensure authentication is available
                .addFilterAfter(attackMitigationFilter(), com.tripplanner.TripPlanner.security.AuthorityRestoreFilter.class)

                // Add AI rate limiting filter AFTER attack mitigation (checks /api/ai/** endpoints only)
                .addFilterAfter(aiRateLimitingFilter(userRepository), com.tripplanner.TripPlanner.filter.AttackMitigationFilter.class)

                // Add general rate limiting filter AFTER AI rate limiting
                .addFilterAfter(rateLimitingFilter(), com.tripplanner.TripPlanner.filter.AiRateLimitingFilter.class)

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
                        // CRITICAL: Static resources must be first to ensure they're always accessible
                        // Vite build artifacts (primary location)
                        .requestMatchers("/assets/**").permitAll()

                        // Root-level static files (HTML, JS, CSS, images, icons)
                        .requestMatchers(
                                "/",                          // Root path
                                "/index.html",                // Main HTML file
                                "/*.js",                      // Root-level JS files
                                "/*.css",                     // Root-level CSS files
                                "/*.ico",                     // Favicon and icons
                                "/*.png",                     // PNG images
                                "/*.jpg",                     // JPG images
                                "/*.jpeg",                    // JPEG images
                                "/*.webp",                    // WebP images
                                "/*.gif",                     // GIF images
                                "/*.svg",                     // SVG files
                                "/favicon.ico",               // Specific favicon
                                "/vite.svg"                   // Vite logo
                        ).permitAll()

                        // Additional static resource directories (for compatibility)
                        .requestMatchers("/css/**", "/js/**", "/images/**", "/webjars/**",
                                "/static/**", "/public/**", "/resources/**").permitAll()

                        // Manifest and PWA files
                        .requestMatchers("/site.webmanifest", "/*.webmanifest", "/manifest.json").permitAll()

                        // SPA routes (forwarded to index.html for client-side routing)
                        .requestMatchers("/dashboard", "/admin", "/profile", "/route-planner", "/trips/**", "/routes/**").permitAll()

                        // Public API endpoint
                        .requestMatchers("/calculate").permitAll()

                        // OAuth and error pages
                        .requestMatchers("/error", "/oauth2/**", "/login/**").permitAll()

                        // Public API endpoints for auth status check, CSRF token, avatar proxy, and routing
                        .requestMatchers("/api/user/me", "/api/user/status", "/api/user/csrf", "/api/avatar/proxy", "/api/routing/**").permitAll()

                        // Admin API endpoints (role-based access via @PreAuthorize)
                        .requestMatchers("/api/admin/**").authenticated()

                        // AI API endpoints (require authentication to prevent abuse)
                        .requestMatchers("/api/ai/**").authenticated()

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
