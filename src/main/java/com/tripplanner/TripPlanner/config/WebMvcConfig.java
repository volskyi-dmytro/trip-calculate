package com.tripplanner.TripPlanner.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Serves static assets (JS/CSS/images) built by Vite into classpath:/static/.
 * SPA-shell serving and locale redirects are handled by SpaShellController
 * and LocaleRedirectController, not here — see
 * docs/superpowers/specs/2026-07-12-seo-implementation-design.md for why
 * this file used to also do SPA fallback and no longer does.
 */
@Slf4j
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @PostConstruct
    public void logStaticResourcesStatus() {
        try {
            ClassPathResource indexHtml = new ClassPathResource("static/index.html");
            ClassPathResource assetsDir = new ClassPathResource("static/assets/");

            log.info("=== STATIC RESOURCES DEBUG ===");
            log.info("index.html exists: {}", indexHtml.exists());
            log.info("index.html path: {}", indexHtml.getURL());
            log.info("assets/ exists: {}", assetsDir.exists());
            log.info("assets/ path: {}", assetsDir.getURL());
            log.info("=============================");
        } catch (IOException e) {
            log.error("Error checking static resources", e);
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCachePeriod(3600)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requestedResource = location.createRelative(resourcePath);
                        if (requestedResource.exists() && requestedResource.isReadable()) {
                            return requestedResource;
                        }
                        return null;
                    }
                });
    }
}
