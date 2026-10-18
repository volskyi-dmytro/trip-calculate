package com.tripplanner.TripPlanner.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Configuration
public class JacksonConfig {

    /**
     * Entities store server-local LocalDateTime; serialised bare, browsers parse it as *their*
     * local time (UTC+3 showed "about 3 hours ago"). Emit an instant (Z) so every client agrees.
     */
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer localDateTimeAsInstant() {
        return builder -> builder.serializerByType(LocalDateTime.class, new JsonSerializer<LocalDateTime>() {
            @Override
            public void serialize(LocalDateTime v, JsonGenerator g, SerializerProvider p) throws IOException {
                g.writeString(v.atZone(ZoneId.systemDefault()).toInstant().toString());
            }
        });
    }
}
