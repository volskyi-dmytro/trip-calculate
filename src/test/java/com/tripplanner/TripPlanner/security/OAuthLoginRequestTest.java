package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.InputStream;
import java.util.List;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@SpringBootTest
@AutoConfigureMockMvc
class OAuthLoginRequestTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void googleLoginUsesPkceOpenIdAndForcesAccountChoice() throws Exception {
        String location = mockMvc.perform(get("/oauth2/authorization/google"))
                .andReturn().getResponse().getHeader("Location");

        assertTrue(location.startsWith("https://accounts.google.com/"), location);
        assertTrue(location.contains("code_challenge="), location);
        assertTrue(location.contains("code_challenge_method=S256"), location);
        assertTrue(location.contains("nonce="), location); // only sent for OpenID Connect
        assertTrue(location.contains("prompt=login"), location);
    }

    // Prod and staging override the scope, so check their files directly.
    @ParameterizedTest
    @ValueSource(strings = {"application-prod.properties", "application-staging.properties"})
    void deployedProfilesRequestTheOpenIdScope(String file) throws Exception {
        Properties properties = new Properties();
        try (InputStream in = new ClassPathResource(file).getInputStream()) {
            properties.load(in);
        }
        List<String> scopes = List.of(
                properties.getProperty("spring.security.oauth2.client.registration.google.scope").split(","));
        assertTrue(scopes.contains("openid"), file + " scopes: " + scopes);
    }
}
