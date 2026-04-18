package com.tripplanner.TripPlanner.ai.config;

import io.netty.channel.ChannelOption;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

/**
 * WebClient configuration for the internal langgraph-agent service (M2).
 *
 * Key tuning decisions for SSE streaming:
 *
 * 1. Response timeout NOT SET on HttpClient — Reactor Netty's responseTimeout measures
 *    time-to-first-byte. An SSE connection is open for the entire agent session (up to
 *    5 minutes), so any positive responseTimeout would fire immediately after the first
 *    byte arrives and then truncate mid-stream. Netty accepts omission as "no timeout".
 *    The per-Flux .timeout(5 min) in AgentServiceClient is the real guard.
 *    See CLAUDE.md §Common Troubleshooting "SSE stream buffers / doesn't stream progressively".
 *
 * 2. Connect timeout 5 000 ms — generous because the agent container may be cold-starting.
 *    Fail fast on TCP connection failures; don't fail on slow first-byte.
 *
 * 3. No Netty read timeout — applies per-chunk and would fire between agent tool calls
 *    (multi-second gaps are normal). The reactor Flux timeout in AgentServiceClient
 *    covers the total session duration instead.
 *
 * 4. maxInMemorySize 512 KB — each individual SSE data frame should be small JSON.
 *    Raise if agent ever emits large payloads per frame.
 *
 * 5. Bean qualifier "agentWebClient" avoids collision with the "supabaseWebClient" bean
 *    defined in AiAccessConfig.
 */
@Configuration
public class AgentWebClientConfig {

    @Value("${ai.agent.service-url:http://langgraph-agent:8000}")
    private String agentServiceUrl;

    /**
     * WebClient for the internal langgraph-agent service.
     *
     * Response timeout is intentionally disabled on the Netty layer.
     * The 5-minute hard cap is enforced reactively in AgentServiceClient.stream().
     */
    @Bean("agentWebClient")
    public WebClient agentWebClient() {
        // responseTimeout is intentionally omitted — passing null or zero is rejected by Netty,
        // and calling .responseTimeout() with any Duration > 0 would fire on the first-byte
        // delay and truncate long-running SSE streams. The 5-minute guard lives in
        // AgentServiceClient.stream() as a reactor-level .timeout() on the Flux instead.
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5_000);

        return WebClient.builder()
                .baseUrl(agentServiceUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(codecs -> codecs.defaultCodecs().maxInMemorySize(512 * 1024)) // 512 KB
                .build();
    }
}
