package com.tripplanner.TripPlanner.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class FuelPriceControllerTest {

    private JdbcTemplate jdbc;
    private FuelPriceController controller;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        controller = new FuelPriceController(jdbc);
    }

    private void mockFxRates() {
        doAnswer(inv -> {
            RowCallbackHandler handler = inv.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("base")).thenReturn("USD", "EUR");
            when(rs.getDouble("rate")).thenReturn(41.8, 45.6);
            handler.processRow(rs);
            handler.processRow(rs);
            return null;
        }).when(jdbc).query(startsWith("SELECT base"), any(RowCallbackHandler.class));
    }

    private void mockFuelRows(Instant fetchedAt) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("country_code")).thenReturn("PL");
        when(rs.getDouble("price")).thenReturn(1.42);
        when(rs.getString("currency")).thenReturn("EUR");
        when(rs.getString("source")).thenReturn("eu_oil_bulletin");
        when(rs.getTimestamp("fetched_at")).thenReturn(Timestamp.from(fetchedAt));
        when(jdbc.query(startsWith("SELECT country_code"), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<Map<String, Object>> mapper = inv.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });
    }

    @Test
    @SuppressWarnings("unchecked")
    void convertsEurPriceToUahViaPivot() throws Exception {
        mockFxRates();
        mockFuelRows(Instant.now());

        ResponseEntity<?> response = controller.getPrices("pl", "petrol", "UAH");

        assertEquals(200, response.getStatusCode().value());
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        List<Map<String, Object>> prices = (List<Map<String, Object>>) body.get("prices");
        assertEquals(1, prices.size());
        assertEquals(64.75, (double) prices.get(0).get("pricePerLiter"), 0.01); // 1.42 * 45.6
        assertEquals(false, prices.get(0).get("stale"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void flagsStaleRows() throws Exception {
        mockFxRates();
        mockFuelRows(Instant.now().minusSeconds(20L * 24 * 3600));

        ResponseEntity<?> response = controller.getPrices("PL", "petrol", "EUR");
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        List<Map<String, Object>> prices = (List<Map<String, Object>>) body.get("prices");
        assertEquals(true, prices.get(0).get("stale"));
    }

    @Test
    void rejectsUnknownFuelTypeAndCurrency() {
        assertEquals(400, controller.getPrices("UA", "kerosene", "UAH").getStatusCode().value());
        assertEquals(400, controller.getPrices("UA", "petrol", "GBP").getStatusCode().value());
        assertEquals(400, controller.getPrices("Ukraine", "petrol", "UAH").getStatusCode().value());
    }
}
