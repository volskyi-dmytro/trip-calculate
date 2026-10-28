package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.service.ReceiptService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.math.BigDecimal;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.containsString;

@SpringBootTest(properties = "app.public-base-url=https://preview.example.invalid")
@AutoConfigureMockMvc
class ReceiptOgSecurityTest {
    private final MockMvc mvc;
    @MockitoBean private ReceiptService receipts;

    @Autowired
    ReceiptOgSecurityTest(MockMvc mvc) { this.mvc = mvc; }

    @Test
    void realAnonymousFilterChainAllowsImageAndPreservesUnavailable404() throws Exception {
        var r = new TripReceipt();
        r.setSlug("abc12345"); r.setOriginLabel("Kyiv"); r.setDestinationLabel("Lviv");
        r.setDistanceKm(new BigDecimal("540")); r.setCostPerPerson(new BigDecimal("24.50"));
        r.setTotalCost(new BigDecimal("98.00")); r.setCurrency("EUR"); r.setPeople(4); r.setLocale("en");
        when(receipts.findForPreview("abc12345")).thenReturn(Optional.of(r));
        mvc.perform(get("/r/abc12345").with(req -> {req.setRemoteAddr("198.51.100.71"); return req;})
                        .header("User-Agent", "TelegramBot (like TwitterBot)"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("https://preview.example.invalid/r/abc12345/og.png")));
        mvc.perform(get("/r/abc12345/og.png").with(req -> {req.setRemoteAddr("198.51.100.72"); return req;})
                        .header("User-Agent", "facebookexternalhit/1.1"))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        when(receipts.findForPreview("abc12345")).thenReturn(Optional.empty());
        mvc.perform(get("/r/abc12345/og.png")).andExpect(status().isNotFound())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(new byte[0]));
        mvc.perform(get("/r/abc12345")).andExpect(status().isNotFound())
                .andExpect(header().string("X-Robots-Tag", "noindex"))
                .andExpect(content().string(containsString("<title>")));
    }

    @Test
    void spoofedForwardingHeadersCannotEvadeImageLookupLimit() throws Exception {
        when(receipts.findForPreview("missing1")).thenReturn(Optional.empty());
        for (int i = 0; i < 60; i++) {
            mvc.perform(get("/r/missing1/og.png")
                            .header("CF-Connecting-IP", "203.0.113." + i)
                            .header("X-Forwarded-For", "127.0.0.1")
                            .with(req -> { req.setRemoteAddr("198.51.100.73"); return req; }))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(get("/r/missing1/og.png")
                        .with(req -> { req.setRemoteAddr("198.51.100.73"); return req; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(receipts, times(60)).findForPreview("missing1");
    }
}
