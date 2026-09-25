package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.service.OgMetaInjector;
import com.tripplanner.TripPlanner.service.ReceiptService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReceiptPageControllerTest {

    private ReceiptService receiptService;
    private ReceiptPageController controller;

    @BeforeEach
    void setUp() {
        receiptService = mock(ReceiptService.class);
        controller = new ReceiptPageController(receiptService, new OgMetaInjector());
    }

    @Test
    void knownReceiptReturns200WithNoindexHeader() {
        when(receiptService.findForPreview("abc12345")).thenReturn(Optional.of(receipt()));

        ResponseEntity<String> response = controller.receiptPage("abc12345");

        assertEquals(200, response.getStatusCode().value());
        assertEquals("noindex", response.getHeaders().getFirst("X-Robots-Tag"));
        assertTrue(response.getBody().contains("<title>"));
    }

    @Test
    void unknownSlugReturns404WithSpaShellBodyAndNoindexHeader() {
        when(receiptService.findForPreview("missing1")).thenReturn(Optional.empty());

        ResponseEntity<String> response = controller.receiptPage("missing1");

        assertEquals(404, response.getStatusCode().value());
        assertEquals("noindex", response.getHeaders().getFirst("X-Robots-Tag"));
        // Still the SPA shell so React's ReceiptPage can render its own not-found UI.
        assertTrue(response.getBody().contains("<title>"));
    }

    @ParameterizedTest
    @CsvSource({
            "1, на 1 особу",
            "3, на 3 особи",
            "5, на 5 осіб",
            "11, на 11 осіб",
            "21, на 21 особу",
            "24, на 24 особи",
    })
    void ukrainianDescriptionDeclinesPeopleCount(int people, String expected) {
        TripReceipt receipt = receipt();
        receipt.setLocale("uk");
        receipt.setPeople(people);
        when(receiptService.findForPreview("abc12345")).thenReturn(Optional.of(receipt));

        String description = injectedDescription();

        assertTrue(description.contains(expected), () -> "expected '" + expected + "' in: " + description);
    }

    @Test
    void englishDescriptionUsesSingularForOnePerson() {
        TripReceipt receipt = receipt();
        receipt.setPeople(1);
        when(receiptService.findForPreview("abc12345")).thenReturn(Optional.of(receipt));

        String description = injectedDescription();

        assertTrue(description.contains("for 1 person."), description);
        assertFalse(description.contains("1 people"), description);
    }

    // The classpath index.html is a placeholder without OG tags, so read the
    // description the controller hands to the injector instead of the HTML.
    private String injectedDescription() {
        OgMetaInjector injector = spy(new OgMetaInjector());
        new ReceiptPageController(receiptService, injector).receiptPage("abc12345");
        ArgumentCaptor<String> description = ArgumentCaptor.forClass(String.class);
        verify(injector).inject(anyString(), anyString(), description.capture(), anyString());
        return description.getValue();
    }

    private TripReceipt receipt() {
        TripReceipt receipt = new TripReceipt();
        receipt.setSlug("abc12345");
        receipt.setOriginLabel("Kyiv");
        receipt.setDestinationLabel("Lviv");
        receipt.setDistanceKm(new BigDecimal("540"));
        receipt.setFuelConsumption(new BigDecimal("7.5"));
        receipt.setFuelPrice(new BigDecimal("55"));
        receipt.setCurrency("UAH");
        receipt.setPeople(3);
        receipt.setTotalCost(new BigDecimal("2200"));
        receipt.setCostPerPerson(new BigDecimal("733.33"));
        receipt.setLocale("en");
        return receipt;
    }
}
