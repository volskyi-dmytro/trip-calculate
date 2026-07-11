package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WeatherProxyControllerTest {

    private WeatherProxyController controller;
    private HttpServer stubAgent;

    @BeforeEach
    void setUp() {
        controller = new WeatherProxyController(new ObjectMapper());
        ReflectionTestUtils.setField(controller, "agentUrl", "http://localhost:1");
    }

    @AfterEach
    void tearDown() {
        if (stubAgent != null) stubAgent.stop(0);
    }

    private WeatherProxyController.CorridorRequest valid() {
        return new WeatherProxyController.CorridorRequest(
                List.of(new WeatherProxyController.CorridorWaypoint("Kyiv", 50.45, 30.52),
                        new WeatherProxyController.CorridorWaypoint("Lviv", 49.84, 24.03)),
                LocalDate.now().toString());
    }

    @Test
    void rejectsMissingEmptyAndOversizedWaypoints() {
        assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                null, LocalDate.now().toString())).getStatusCode().value());
        assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                List.of(), LocalDate.now().toString())).getStatusCode().value());
        List<WeatherProxyController.CorridorWaypoint> tooMany = Collections.nCopies(
                26, new WeatherProxyController.CorridorWaypoint("Kyiv", 50.45, 30.52));
        assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                tooMany, LocalDate.now().toString())).getStatusCode().value());
    }

    @Test
    void rejectsBadCoordinatesAndBlankNames() {
        assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                List.of(new WeatherProxyController.CorridorWaypoint("Kyiv", 91.0, 30.52)),
                LocalDate.now().toString())).getStatusCode().value());
        assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                List.of(new WeatherProxyController.CorridorWaypoint("  ", 50.45, 30.52)),
                LocalDate.now().toString())).getStatusCode().value());
    }

    @Test
    void rejectsUnparseablePastAndBeyondWindowDates() {
        for (String bad : new String[]{
                "not-a-date",
                LocalDate.now().minusDays(1).toString(),
                LocalDate.now().plusDays(17).toString()}) {
            assertEquals(400, controller.corridor(new WeatherProxyController.CorridorRequest(
                    List.of(new WeatherProxyController.CorridorWaypoint("Kyiv", 50.45, 30.52)),
                    bad)).getStatusCode().value(), "should reject: " + bad);
        }
    }

    @Test
    void agentUnreachableYieldsNullWeatherNotError() {
        ResponseEntity<String> resp = controller.corridor(valid());
        assertEquals(200, resp.getStatusCode().value());
        assertEquals("{\"weather_data\":null}", resp.getBody());
    }

    @Test
    void blankAgentUrlYieldsNullWeather() {
        ReflectionTestUtils.setField(controller, "agentUrl", "");
        ResponseEntity<String> resp = controller.corridor(valid());
        assertEquals(200, resp.getStatusCode().value());
        assertEquals("{\"weather_data\":null}", resp.getBody());
    }

    @Test
    void relaysAgentBodyVerbatimOn200() throws Exception {
        String agentBody = "{\"weather_data\":{\"date\":\"2026-07-12\",\"samples\":[],"
                + "\"risk_flags\":[],\"source\":\"open-meteo\",\"fetched_at\":\"2026-07-12T00:00:00Z\"}}";
        stubAgent = HttpServer.create(new InetSocketAddress(0), 0);
        stubAgent.createContext("/weather-corridor", exchange -> {
            byte[] out = agentBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(out); }
        });
        stubAgent.start();
        ReflectionTestUtils.setField(controller, "agentUrl",
                "http://localhost:" + stubAgent.getAddress().getPort());

        ResponseEntity<String> resp = controller.corridor(valid());
        assertEquals(200, resp.getStatusCode().value());
        assertEquals(agentBody, resp.getBody());
    }

    @Test
    void agentNon200YieldsNullWeather() throws Exception {
        stubAgent = HttpServer.create(new InetSocketAddress(0), 0);
        stubAgent.createContext("/weather-corridor", exchange -> {
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        stubAgent.start();
        ReflectionTestUtils.setField(controller, "agentUrl",
                "http://localhost:" + stubAgent.getAddress().getPort());

        ResponseEntity<String> resp = controller.corridor(valid());
        assertEquals(200, resp.getStatusCode().value());
        assertEquals("{\"weather_data\":null}", resp.getBody());
    }
}
