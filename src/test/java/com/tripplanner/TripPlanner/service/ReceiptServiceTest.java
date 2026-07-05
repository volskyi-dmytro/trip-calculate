package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.dto.CreateReceiptRequest;
import com.tripplanner.TripPlanner.dto.ReceiptDTO;
import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Guards the receipt snapshot's integrity: totals are recomputed server-side,
 * labels are sanitized (receipts are rendered to strangers), anonymous
 * receipts expire, and expired links answer 410 rather than leaking data.
 */
class ReceiptServiceTest {

    private TripReceiptRepository repository;
    private ReceiptService service;

    @BeforeEach
    void setUp() {
        repository = mock(TripReceiptRepository.class);
        when(repository.existsBySlug(anyString())).thenReturn(false);
        // echo back the entity passed to save()
        when(repository.save(any(TripReceipt.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new ReceiptService(repository, new SlugGenerator(), new ObjectMapper());
    }

    private CreateReceiptRequest validRequest() {
        CreateReceiptRequest req = new CreateReceiptRequest();
        req.setOriginLabel("Kyiv");
        req.setDestinationLabel("Lviv");
        req.setDistanceKm(540.0);
        req.setFuelConsumption(7.5);
        req.setFuelPrice(58.0);
        req.setCurrency("UAH");
        req.setPeople(4);
        req.setLocale("uk");
        return req;
    }

    @Test
    void recomputesTotalsServerSide() {
        ReceiptDTO dto = service.create(validRequest(), null);
        // 540/100 * 7.5 * 58 = 2349.00; 2349/4 = 587.25
        assertEquals(new BigDecimal("2349.00"), dto.getTotalCost());
        assertEquals(new BigDecimal("587.25"), dto.getCostPerPerson());
    }

    @Test
    void anonymousReceiptGetsThirtyDayExpiry() {
        ReceiptDTO dto = service.create(validRequest(), null);
        assertNotNull(dto.getExpiresAt());
        assertTrue(dto.getExpiresAt().isAfter(LocalDateTime.now().plusDays(29)));
    }

    @Test
    void ownedReceiptNeverExpires() {
        ReceiptDTO dto = service.create(validRequest(), 42L);
        assertNull(dto.getExpiresAt());
    }

    @Test
    void sanitizesHtmlOutOfLabels() {
        CreateReceiptRequest req = validRequest();
        req.setOriginLabel("<script>alert(1)</script>Kyiv");
        ReceiptDTO dto = service.create(req, null);
        assertFalse(dto.getOriginLabel().contains("<"));
        assertTrue(dto.getOriginLabel().contains("Kyiv"));
    }

    @Test
    void rejectsAbsurdDistance() {
        CreateReceiptRequest req = validRequest();
        req.setDistanceKm(999999.0);
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.create(req, null));
        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void rejectsUnknownCurrency() {
        CreateReceiptRequest req = validRequest();
        req.setCurrency("BTC");
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.create(req, null));
        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void dropsInvalidGeometryInsteadOfFailing() {
        CreateReceiptRequest req = validRequest();
        req.setRouteGeometry("not json at all");
        ReceiptDTO dto = service.create(req, null);
        assertNull(dto.getRouteGeometry());
    }

    @Test
    void keepsValidGeometry() {
        CreateReceiptRequest req = validRequest();
        req.setRouteGeometry("[[50.45,30.52],[49.84,24.03]]");
        ReceiptDTO dto = service.create(req, null);
        assertEquals("[[50.45,30.52],[49.84,24.03]]", dto.getRouteGeometry());
    }

    @Test
    void expiredReceiptAnswers410() {
        TripReceipt expired = new TripReceipt();
        expired.setSlug("abc12345");
        expired.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(repository.findBySlug("abc12345")).thenReturn(Optional.of(expired));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.getBySlug("abc12345"));
        assertEquals(410, ex.getStatusCode().value());
    }

    @Test
    void unknownSlugAnswers404() {
        when(repository.findBySlug("nope0000")).thenReturn(Optional.empty());
        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.getBySlug("nope0000"));
        assertEquals(404, ex.getStatusCode().value());
    }

    @Test
    void getBySlugIncrementsViewCount() {
        TripReceipt receipt = freshStoredReceipt();
        when(repository.findBySlug("live0000")).thenReturn(Optional.of(receipt));

        service.getBySlug("live0000");

        verify(repository).incrementViewCount("live0000");
    }

    @Test
    void getBySlugDoesNotMutateManagedEntity() {
        TripReceipt receipt = freshStoredReceipt();
        when(repository.findBySlug("live0000")).thenReturn(Optional.of(receipt));

        ReceiptDTO dto = service.getBySlug("live0000");

        // DTO echoes the increment; the JPA-managed entity stays untouched so
        // Hibernate's dirty-check flush cannot overwrite concurrent increments
        assertEquals(1L, dto.getViewCount());
        assertEquals(0L, receipt.getViewCount());
    }

    @Test
    void deleteRejectsNonOwner() {
        TripReceipt receipt = freshStoredReceipt();
        receipt.setUserId(1L);
        when(repository.findBySlug("live0000")).thenReturn(Optional.of(receipt));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.delete("live0000", 2L));
        assertEquals(404, ex.getStatusCode().value());
        verify(repository, never()).delete(any(TripReceipt.class));
    }

    @Test
    void findForPreviewSkipsExpired() {
        TripReceipt expired = new TripReceipt();
        expired.setSlug("abc12345");
        expired.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(repository.findBySlug("abc12345")).thenReturn(Optional.of(expired));

        assertTrue(service.findForPreview("abc12345").isEmpty());
    }

    private TripReceipt freshStoredReceipt() {
        TripReceipt r = new TripReceipt();
        r.setSlug("live0000");
        r.setOriginLabel("Kyiv");
        r.setDestinationLabel("Lviv");
        r.setDistanceKm(new BigDecimal("540.0"));
        r.setFuelConsumption(new BigDecimal("7.5"));
        r.setFuelPrice(new BigDecimal("58.0"));
        r.setCurrency("UAH");
        r.setPeople(4);
        r.setTotalCost(new BigDecimal("2349.00"));
        r.setCostPerPerson(new BigDecimal("587.25"));
        r.setLocale("uk");
        r.setViewCount(0L);
        r.setCtaClickCount(0L);
        return r;
    }
}
