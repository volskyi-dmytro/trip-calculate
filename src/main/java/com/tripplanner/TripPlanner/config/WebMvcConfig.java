package com.tripplanner.TripPlanner.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Web MVC Configuration for serving React frontend and handling SPA routing
 *
 * This configuration ensures that:
 * 1. Static resources are served from classpath:/static/ (where Vite builds them)
 * 2. All non-API routes are forwarded to index.html for React Router to handle
 * 3. Direct navigation to SPA routes (e.g., /route-planner) works correctly
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

            // List all static resources
            ClassPathResource staticDir = new ClassPathResource("static/");
            if (staticDir.exists()) {
                log.info("static/ directory exists: true");
                log.info("static/ URL: {}", staticDir.getURL());
            } else {
                log.error("static/ directory DOES NOT EXIST!");
            }

            log.info("=============================");
        } catch (IOException e) {
            log.error("Error checking static resources", e);
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Explicitly configure static resource handling for React frontend
        // This ensures Spring Boot serves files from BOOT-INF/classes/static/ in the JAR
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCachePeriod(3600)  // Cache for 1 hour (adjust as needed)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requestedResource = location.createRelative(resourcePath);

                        // If the requested resource exists, serve it
                        if (requestedResource.exists() && requestedResource.isReadable()) {
                            return requestedResource;
                        }

                        // For SPA routing: if resource not found and it's not an API call,
                        // serve index.html to let React Router handle the route
                        if (!resourcePath.startsWith("api/") &&
                            !resourcePath.startsWith("oauth2/") &&
                            !resourcePath.startsWith("login/") &&
                            !resourcePath.startsWith("logout") &&
                            !resourcePath.startsWith("calculate") &&
                            !resourcePath.startsWith("actuator/")) {
                            return new ClassPathResource("/static/index.html");
                        }

                        return null;
                    }
                });
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // SPA routing - forward specific routes to index.html
        // This ensures that direct navigation to these routes works
        // (e.g., typing /route-planner in the browser)

        // Root
        registry.addViewController("/").setViewName("forward:/index.html");

        // Frontend routes (React Router handles these client-side)
        registry.addViewController("/route-planner").setViewName("forward:/index.html");
        registry.addViewController("/dashboard").setViewName("forward:/index.html");
        registry.addViewController("/admin").setViewName("forward:/index.html");
        registry.addViewController("/profile").setViewName("forward:/index.html");
        registry.addViewController("/calculator").setViewName("forward:/index.html");

        // Note: /trips/** and /routes/** are handled by the PathResourceResolver above
    }
}
