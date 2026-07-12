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

        // Configure CSRF cookie repository with SameSite=Strict.
        // SameSite=Strict is safe here despite Google OAuth redirecting back from a different domain:
        // the OAuth callback (/login/oauth2/code/google) is a GET request, and Spring Security
        // never validates the XSRF-TOKEN for GET requests. All state-changing requests (POST/PUT/DELETE)
        // are made by same-origin JavaScript, so the cookie is always sent.
        // Spring Security 6.3 uses setCookieCustomizer() rather than setCookieSameSite() for this.
        CookieCsrfTokenRepository csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokenRepository.setCookieCustomizer(cookieBuilder -> cookieBuilder.sameSite("Strict"));

        // Content Security Policy: restrict where resources can be loaded from.
        // Managed exclusively by Spring Security — not set in Nginx Proxy Manager to avoid duplication.
        // Each directive is annotated below with why the exception exists.
        String csp = String.join("; ",
            // Only allow resources from our own origin by default
            "default-src 'self'",

            // Scripts: 'unsafe-inline' is required because Vite bundles React with inline module
            // bootstrap code, and Mapbox GL JS injects inline worker scripts at runtime.
            // Cloudflare Insights is included because Cloudflare injects it at the CDN/proxy
            // layer (not from this app's HTML) — allowing it here prevents CSP violations.
            "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",

            // Styles: 'unsafe-inline' required by Mapbox GL (applies styles to DOM elements at runtime)
            // and React inline style props. Google Fonts CSS loaded via <link> in index.html.
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

            // Images: data: for SVG/icon data URIs; blob: for canvas exports;
            // *.mapbox.com for map sprites, glyphs, and tile previews
            "img-src 'self' data: blob: https://*.mapbox.com",

            // Fonts: Google Fonts serves actual font files from fonts.gstatic.com
            "font-src 'self' https://fonts.gstatic.com",

            // Connections (XHR/fetch/WebSocket):
            // - api.mapbox.com: Mapbox styles, sprites, glyphs, geocoding
            // - events.mapbox.com: Mapbox usage telemetry
            // - *.tiles.mapbox.com: Mapbox vector/raster tile CDN
            // - nominatim.openstreetmap.org: geocodingService.ts calls this directly from the browser
            // - static.cloudflareinsights.com: Cloudflare Insights beacon reporting endpoint
            "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://nominatim.openstreetmap.org https://static.cloudflareinsights.com",

            // Workers: Mapbox GL spawns Web Workers via blob: URLs for tile decoding
            "worker-src blob:",

            // child-src is the legacy fallback for worker-src in older browsers
            "child-src blob:",

            // No external frames allowed (defense-in-depth alongside X-Frame-Options: DENY)
            "frame-src 'none'",

            // Only allow form submissions to same origin (OAuth login goes to /oauth2/authorization/google
            // which is a server-side redirect, not a form post to Google)
            "form-action 'self'",

            // Restrict base tag to prevent base URI hijacking attacks
            "base-uri 'self'"
        );

        http
                // Enable CSRF protection (OAuth2 requires it)
                .csrf(csrf -> csrf
                        // Disable CSRF only for public API endpoints and AI endpoints
                        .ignoringRequestMatchers("/calculate", "/api/routing/**", "/api/ai/**")
                        // Use cookie-based CSRF tokens with SameSite=Strict (see comment above)
                        .csrfTokenRepository(csrfTokenRepository)
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
                        .contentSecurityPolicy(cspConfig -> cspConfig.policyDirectives(csp))
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

                        // Read-only country-average fuel prices for the manual route flow;
                        // must work for logged-out users (no AI/auth dependency)
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/fuel-prices").permitAll()

                        // Receipt share links: creation/viewing is anonymous by design (viral loop);
                        // ownership checks for list/delete happen in ReceiptController.
                        // /r/** serves the OG-injected HTML for crawlers and browsers.
                        .requestMatchers("/api/receipts/**", "/r/**").permitAll()

                        // Admin API endpoints (role-based access via @PreAuthorize)
                        .requestMatchers("/api/admin/**").authenticated()

                        // AI API endpoints (require authentication to prevent abuse)
                        .requestMatchers("/api/ai/**").authenticated()

                        // Weather corridor endpoint: /route-planner is login-gated
                        // (ProtectedRoute), so only authenticated sessions ever call this
                        .requestMatchers("/api/weather/**").authenticated()

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
