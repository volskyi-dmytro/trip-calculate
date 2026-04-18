package com.tripplanner.TripPlanner.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.ai.access.AiAccessFilter;
import com.tripplanner.TripPlanner.ai.access.AiAccessService;
import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

/**
 * Spring configuration for the AI access layer introduced in M1.
 *
 * Provides:
 *  - A scoped {@link WebClient} pre-configured with the Supabase base URL,
 *    Content-Type: application/json default header, and explicit network timeouts
 *    (Blocker 1: connect=2s, response=3s, read=3s via ReactorClientHttpConnector).
 *  - The {@link AiAccessFilter} bean (not a @Component so it doesn't auto-register
 *    as a Servlet filter; SecurityConfig registers it in the right position).
 */
@Configuration
public class AiAccessConfig {

    @Value("${ai.access.supabase-url}")
    private String supabaseUrl;

    /**
     * WebClient configured for Supabase REST API calls.
     * Uses the qualifier "supabaseWebClient" to avoid conflicts with any other
     * WebClient beans that may be introduced in later milestones.
     *
     * Blocker 1: ReactorClientHttpConnector sets:
     *  - Connect timeout: 2 000 ms (TCP handshake limit)
     *  - Response timeout: 3 s (time to first byte from Supabase)
     *  - Read timeout: 3 s (time to complete response body)
     * Per-Mono .timeout(3s) in SupabaseClient provides the final guard for the reactive chain.
     */
    @Bean("supabaseWebClient")
    public WebClient supabaseWebClient() {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 2_000)
                .responseTimeout(Duration.ofSeconds(3));

        return WebClient.builder()
                .baseUrl(supabaseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .defaultHeader("Content-Type", "application/json")
                .codecs(codecs -> codecs.defaultCodecs().maxInMemorySize(512 * 1024)) // 512 KB
                .build();
    }

    /**
     * AiAccessFilter bean.
     *
     * Declared here (not as @Component on the filter class) to prevent Spring Boot
     * from auto-registering it as a global Servlet filter via FilterRegistrationBean.
     * SecurityConfig calls addFilterAfter() to place it correctly in the security
     * filter chain after the OAuth2 filters.
     */
    @Bean
    public AiAccessFilter aiAccessFilter(AiAccessService aiAccessService,
                                         ObjectMapper objectMapper) {
        return new AiAccessFilter(aiAccessService, objectMapper);
    }
}
