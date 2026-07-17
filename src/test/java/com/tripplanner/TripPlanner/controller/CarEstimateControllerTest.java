package com.tripplanner.TripPlanner.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

class CarEstimateControllerTest {

    private ObjectMapper objectMapper;
    private MutableClock clock;
    private OAuth2User principal;

    private static final String HAPPY_JSON =
            "{\"makeModel\":\"Toyota Corolla\",\"fuelType\":\"petrol\",\"consumptionL100km\":6.5,\"unknown\":false}";

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        clock = new MutableClock(Instant.parse("2026-07-17T10:00:00Z"));
        principal = mock(OAuth2User.class);
        doReturn("user-1").when(principal).getAttribute("sub");
    }

    private CanningController controllerReturning(String json) {
        CanningController c = new CanningController(objectMapper, clock, json, null);
        ReflectionTestUtils.setField(c, "agentUrl", "http://agent");
        return c;
    }

    private CanningController controllerThrowing(IOException toThrow) {
        CanningController c = new CanningController(objectMapper, clock, null, toThrow);
        ReflectionTestUtils.setField(c, "agentUrl", "http://agent");
        return c;
    }

    private CarEstimateController.EstimateRequest req(String description) {
        return new CarEstimateController.EstimateRequest(description, "en");
    }

    @Test
    void happyPathReturns200WithThreeFields() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        ResponseEntity<?> resp = controller.estimate(req("2015 Toyota Corolla 1.6"), principal);

        assertEquals(200, resp.getStatusCode().value());
        String body = (String) resp.getBody();
        assertEquals(true, body.contains("\"makeModel\":\"Toyota Corolla\""));
        assertEquals(true, body.contains("\"fuelType\":\"petrol\""));
        assertEquals(true, body.contains("\"consumptionL100km\":6.5"));
    }

    @Test
    void unknownTrueReturns422() {
        String json = "{\"makeModel\":null,\"fuelType\":null,\"consumptionL100km\":null,\"unknown\":true}";
        CanningController controller = controllerReturning(json);

        ResponseEntity<?> resp = controller.estimate(req("some gibberish description"), principal);

        assertEquals(422, resp.getStatusCode().value());
        assertEquals("{\"error\":\"unknown_car\"}", resp.getBody());
    }

    @Test
    void consumptionOutOfBoundsReturns422() {
        String json = "{\"makeModel\":\"Big Truck\",\"fuelType\":\"diesel\",\"consumptionL100km\":26.0,\"unknown\":false}";
        CanningController controller = controllerReturning(json);

        ResponseEntity<?> resp = controller.estimate(req("some huge truck description"), principal);

        assertEquals(422, resp.getStatusCode().value());
        assertEquals("{\"error\":\"unknown_car\"}", resp.getBody());
    }

    @Test
    void invalidFuelTypeCurrencyConfusionReturns422() {
        String json = "{\"makeModel\":\"Some Car\",\"fuelType\":\"UAH\",\"consumptionL100km\":6.5,\"unknown\":false}";
        CanningController controller = controllerReturning(json);

        ResponseEntity<?> resp = controller.estimate(req("some car with weird fuel field"), principal);

        assertEquals(422, resp.getStatusCode().value());
        assertEquals("{\"error\":\"unknown_car\"}", resp.getBody());
    }

    @Test
    void blankDescriptionReturns400() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        ResponseEntity<?> resp = controller.estimate(req("   "), principal);

        assertEquals(400, resp.getStatusCode().value());
        assertEquals("{\"error\":\"invalid_description\"}", resp.getBody());
    }

    @Test
    void tooLongDescriptionReturns400() {
        CanningController controller = controllerReturning(HAPPY_JSON);
        String tooLong = "a".repeat(201);

        ResponseEntity<?> resp = controller.estimate(req(tooLong), principal);

        assertEquals(400, resp.getStatusCode().value());
        assertEquals("{\"error\":\"invalid_description\"}", resp.getBody());
    }

    @Test
    void sixthCallInSameMinuteIsRateLimitedThenClearsAfterSixtyOneSeconds() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        for (int i = 0; i < 5; i++) {
            ResponseEntity<?> resp = controller.estimate(req("distinct description number " + i), principal);
            assertEquals(200, resp.getStatusCode().value(), "call " + i + " should succeed");
        }
        ResponseEntity<?> sixth = controller.estimate(req("distinct description number 6"), principal);
        assertEquals(429, sixth.getStatusCode().value());
        assertEquals("{\"error\":\"rate_limited\"}", sixth.getBody());

        clock.advanceSeconds(61);

        ResponseEntity<?> afterWindow = controller.estimate(req("distinct description number 7"), principal);
        assertEquals(200, afterWindow.getStatusCode().value());
    }

    @Test
    void twentyFirstCallWithinHourIsRateLimited() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        int call = 0;
        for (int minute = 0; minute < 4; minute++) {
            for (int i = 0; i < 5; i++) {
                ResponseEntity<?> resp = controller.estimate(req("hour test description " + call), principal);
                assertEquals(200, resp.getStatusCode().value(), "call " + call + " should succeed");
                call++;
            }
            clock.advanceSeconds(61);
        }
        // 20 calls consumed across 4 minute-windows (5 each), still within the hour.
        ResponseEntity<?> twentyFirst = controller.estimate(req("hour test description " + call), principal);
        assertEquals(429, twentyFirst.getStatusCode().value());
        assertEquals("{\"error\":\"rate_limited\"}", twentyFirst.getBody());
    }

    @Test
    void identicalDescriptionsHitCacheAndCallAgentOnce() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        ResponseEntity<?> first = controller.estimate(req("  Toyota Corolla 2015  "), principal);
        ResponseEntity<?> second = controller.estimate(req("toyota corolla 2015"), principal);

        assertEquals(200, first.getStatusCode().value());
        assertEquals(200, second.getStatusCode().value());
        assertEquals(1, controller.callCount.get());
    }

    @Test
    void internalWhitespaceRunsNormalizeToSameCacheKey() {
        CanningController controller = controllerReturning(HAPPY_JSON);

        ResponseEntity<?> first = controller.estimate(req("skoda   octavia  a5"), principal);
        ResponseEntity<?> second = controller.estimate(req("skoda octavia a5"), principal);

        assertEquals(200, first.getStatusCode().value());
        assertEquals(200, second.getStatusCode().value());
        assertEquals(1, controller.callCount.get());
    }

    @Test
    void agentIOExceptionReturns503() {
        CanningController controller = controllerThrowing(new IOException("boom"));

        ResponseEntity<?> resp = controller.estimate(req("description that triggers io failure"), principal);

        assertEquals(503, resp.getStatusCode().value());
        assertEquals("{\"error\":\"estimate_unavailable\"}", resp.getBody());
    }

    /** Test double: overrides the agent HTTP hook to return canned JSON or throw. */
    private static class CanningController extends CarEstimateController {
        final AtomicInteger callCount = new AtomicInteger();
        private final String canned;
        private final IOException toThrow;

        CanningController(ObjectMapper objectMapper, Clock clock, String canned, IOException toThrow) {
            super(objectMapper, clock);
            this.canned = canned;
            this.toThrow = toThrow;
        }

        @Override
        String callAgent(String jsonBody) throws IOException {
            callCount.incrementAndGet();
            if (toThrow != null) throw toThrow;
            return canned;
        }
    }

    /** A Clock whose instant can be advanced, so rate-limit window expiry is testable. */
    private static class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advanceSeconds(long seconds) {
            this.instant = this.instant.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
