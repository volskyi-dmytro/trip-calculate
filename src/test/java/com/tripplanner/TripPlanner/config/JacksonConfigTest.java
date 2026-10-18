package com.tripplanner.TripPlanner.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** QA F4: LocalDateTime must serialize with an explicit offset so browsers don't read it as local time. */
class JacksonConfigTest {

    @Test
    void localDateTimeSerializesAsUtcInstant() throws Exception {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
            Jackson2ObjectMapperBuilder b = Jackson2ObjectMapperBuilder.json();
            new JacksonConfig().localDateTimeAsInstant().customize(b);
            ObjectMapper mapper = b.build();

            assertEquals("\"2026-10-18T17:39:38.019188Z\"",
                    mapper.writeValueAsString(LocalDateTime.parse("2026-10-18T17:39:38.019188")));

            // Non-UTC JVM: the wall-clock value is converted, not just suffixed with Z.
            TimeZone.setDefault(TimeZone.getTimeZone("Europe/Kyiv"));
            assertEquals("\"2026-10-18T14:39:38Z\"",
                    mapper.writeValueAsString(LocalDateTime.parse("2026-10-18T17:39:38")));
        } finally {
            TimeZone.setDefault(original);
        }
    }
}
