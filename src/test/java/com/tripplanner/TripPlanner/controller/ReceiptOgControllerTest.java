package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.filter.ReceiptOgRateLimiter;
import com.tripplanner.TripPlanner.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReceiptOgControllerTest {
    private final ReceiptService receipts = mock(ReceiptService.class);
    private final ReceiptOgRenderer renderer = mock(ReceiptOgRenderer.class);
    private final ReceiptOgController controller = new ReceiptOgController(receipts, renderer, new ReceiptOgRateLimiter());
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @Test
    void cachedImageStillChecksExpiryAndDeletion() throws Exception {
        var r = new TripReceipt();
        when(receipts.findForPreview("abc12345")).thenReturn(Optional.of(r), Optional.of(r), Optional.empty());
        when(renderer.render(r)).thenReturn(new byte[]{1, 2, 3});
        assertEquals(200, controller.image("abc12345", request).getStatusCode().value());
        assertEquals(200, controller.image("abc12345", request).getStatusCode().value());
        var missing = controller.image("abc12345", request);
        assertEquals(404, missing.getStatusCode().value());
        assertNull(missing.getBody());
        assertEquals("no-store", missing.getHeaders().getCacheControl());
        verify(renderer, times(1)).render(r);
    }

    @Test
    void invalidSlugDoesNotReachDatabase() throws Exception {
        assertEquals(404, controller.image("too-long-slug", request).getStatusCode().value());
        verifyNoInteractions(receipts, renderer);
    }

    @Test
    void unknownSlugsAreLimitedBeforeLookup() throws Exception {
        when(receipts.findForPreview("abc12345")).thenReturn(Optional.empty());
        for (int i = 0; i < 60; i++) assertEquals(404, controller.image("abc12345", request).getStatusCode().value());
        var limited = controller.image("abc12345", request);
        assertEquals(429, limited.getStatusCode().value());
        assertEquals("60", limited.getHeaders().getFirst("Retry-After"));
        assertEquals("no-store", limited.getHeaders().getCacheControl());
        verify(receipts, times(60)).findForPreview("abc12345");
    }

    @Test
    void expiresWhileRenderingDoesNotReturnTheImage() throws Exception {
        var r = new TripReceipt();
        when(receipts.findForPreview("abc12345")).thenReturn(Optional.of(r));
        when(renderer.render(r)).thenAnswer(invocation -> {
            r.setExpiresAt(LocalDateTime.now().minusSeconds(1));
            return new byte[]{1};
        });
        assertEquals(404, controller.image("abc12345", request).getStatusCode().value());
    }

    @Test
    void cacheEvictsLeastRecentlyUsedImage() throws Exception {
        var r = new TripReceipt();
        when(receipts.findForPreview(anyString())).thenReturn(Optional.of(r));
        when(renderer.render(r)).thenReturn(new byte[]{1});
        for (int i = 0; i < 33; i++) controller.image(String.format("%08d", i), request);
        controller.image("00000000", request);
        verify(renderer, times(34)).render(r);
    }

    @Test
    void concurrentColdRenderReturnsRetryInsteadOfQueuing() throws Exception {
        var r = new TripReceipt();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(receipts.findForPreview(anyString())).thenReturn(Optional.of(r));
        when(renderer.render(r)).thenAnswer(invocation -> {
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("render never released");
            return new byte[]{1};
        });
        var executor = Executors.newSingleThreadExecutor();
        try {
            var first = executor.submit(() -> controller.image("abc12345", request));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            var second = controller.image("def12345", request);
            assertEquals(503, second.getStatusCode().value());
            assertEquals("2", second.getHeaders().getFirst("Retry-After"));
            release.countDown();
            assertEquals(200, first.get(5, TimeUnit.SECONDS).getStatusCode().value());
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void secondCrawlerOfSameFreshReceiptWaitsForCachedImageInsteadOfFailing() throws Exception {
        var r = new TripReceipt();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(receipts.findForPreview(anyString())).thenReturn(Optional.of(r));
        when(renderer.render(r)).thenAnswer(invocation -> {
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("render never released");
            return new byte[]{1};
        });
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> controller.image("abc12345", request));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            var second = executor.submit(() -> controller.image("abc12345", request));
            Thread.sleep(200); // let the second crawler reach the lock
            release.countDown();
            assertEquals(200, first.get(5, TimeUnit.SECONDS).getStatusCode().value());
            assertEquals(200, second.get(5, TimeUnit.SECONDS).getStatusCode().value());
            verify(renderer, times(1)).render(r);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }
}
