package com.tripplanner.TripPlanner.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // SPA routing: Forward all non-API, non-OAuth, non-static routes to index.html
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .setCachePeriod(3600)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requestedResource = location.createRelative(resourcePath);

                        // If the resource exists (e.g., CSS, JS, images), serve it
                        if (requestedResource.exists() && requestedResource.isReadable()) {
                            return requestedResource;
                        }

                        // If the path starts with API or OAuth endpoints, don't forward to index.html
                        if (resourcePath.startsWith("api/") ||
                            resourcePath.startsWith("oauth2/") ||
                            resourcePath.startsWith("login/") ||
                            resourcePath.startsWith("logout") ||
                            resourcePath.startsWith("calculate")) {
                            return null;
                        }

                        // Otherwise, serve index.html for client-side routing
                        return new ClassPathResource("/static/index.html");
                    }
                });
    }
}
