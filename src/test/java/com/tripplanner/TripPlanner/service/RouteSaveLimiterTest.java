package com.tripplanner.TripPlanner.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class RouteSaveLimiterTest {
    @Test void configurableCapsRejectOnlySaturatedUserOrGlobalCapacity() {
        RouteSaveLimiter limiter = new RouteSaveLimiter(3, 2);
        try (var one = limiter.acquire(1L); var two = limiter.acquire(1L)) {
            busy(() -> limiter.acquire(1L));
            try (var three = limiter.acquire(2L)) { busy(() -> limiter.acquire(3L)); }
            try (var recovered = limiter.acquire(3L)) { assertThat(recovered).isNotNull(); }
        }
        try (var recovered = limiter.acquire(1L)) { assertThat(recovered).isNotNull(); }
    }
    @Test void closeIsIdempotentAndIdleUsersAreNotRetained() throws Exception {
        RouteSaveLimiter limiter = new RouteSaveLimiter(4, 1);
        for (long user = 1; user <= 10_000; user++) {
            var lease = limiter.acquire(user); lease.close(); lease.close();
        }
        var field = RouteSaveLimiter.class.getDeclaredField("activeUsers"); field.setAccessible(true);
        assertThat((java.util.Map<?, ?>) field.get(limiter)).isEmpty();
        try (var one = limiter.acquire(1L); var two = limiter.acquire(2L);
             var three = limiter.acquire(3L); var four = limiter.acquire(4L)) { busy(() -> limiter.acquire(5L)); }
    }
    @Test void invalidConfigurationAndUnauthenticatedAdmissionAreRejected() {
        for (int[] caps : new int[][]{{0,1},{4,0},{4,5},{1025,1},{-1,1}}) {
            assertThatThrownBy(() -> new RouteSaveLimiter(caps[0], caps[1])).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> new RouteSaveLimiter(4,1).acquire(null))
            .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(401));
    }
    private void busy(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class, e -> {
            assertThat(e.getStatusCode().value()).isEqualTo(429);
            assertThat(e.getReason()).isEqualTo("ROUTE_SAVE_BUSY");
        });
    }
}
