package com.tripplanner.TripPlanner.filter;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AiRateLimitingFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatedUserIsLimitedToTenAiRequestsPerDay() throws Exception {
        authenticate("user@example.com", 1L);
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 500);
        FilterChain chain = mock(FilterChain.class);

        for (int i = 0; i < 10; i++) {
            assertEquals(200, invoke(filter, chain).getStatus());
        }

        assertEquals(429, invoke(filter, chain).getStatus());
        verify(chain, times(10)).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void authenticatedUserMinuteLimitPreventsBursts() throws Exception {
        authenticate("user@example.com", 1L);
        AiRateLimitingFilter filter = configuredFilter(3, 100, 100, 500);
        FilterChain chain = mock(FilterChain.class);

        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(429, invoke(filter, chain).getStatus());
    }

    @Test
    void repeatedUserQuotaRejectionsUseCooldownFastPath() throws Exception {
        authenticate("user@example.com", 1L);
        AiRateLimitingFilter filter = configuredFilter(1, 100, 100, 500);
        FilterChain chain = mock(FilterChain.class);

        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(429, invoke(filter, chain).getStatus());
        for (int i = 0; i < 20; i++) {
            assertEquals(429, invoke(filter, chain).getStatus());
        }

        AtomicLong totalRequests = (AtomicLong) ReflectionTestUtils.getField(filter, "totalRequests");
        assertEquals(2, totalRequests.get());
    }

    @Test
    void authenticatedUserHourlyLimitIsEnforced() throws Exception {
        authenticate("user@example.com", 1L);
        AiRateLimitingFilter filter = configuredFilter(100, 2, 100, 500);
        FilterChain chain = mock(FilterChain.class);

        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(200, invoke(filter, chain).getStatus());
        assertEquals(429, invoke(filter, chain).getStatus());
    }

    @Test
    void globalDailyLimitBoundsSpendAcrossGoogleUsers() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 2);
        FilterChain chain = mock(FilterChain.class);

        authenticate("one@example.com", 1L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("two@example.com", 2L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("three@example.com", 3L);

        assertEquals(429, invoke(filter, chain).getStatus());
        Map<?, ?> buckets = (Map<?, ?>) ReflectionTestUtils.getField(filter, "userLimits");
        assertEquals(2, buckets.size());
        verify(chain, times(2)).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

    }

    @Test
    void repeatedGlobalQuotaRejectionsAvoidLockAndIdentityAllocation() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 100, 1);
        FilterChain chain = mock(FilterChain.class);

        authenticate("one@example.com", 1L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("two@example.com", 2L);
        assertEquals(429, invoke(filter, chain).getStatus());
        for (long id = 3; id <= 20; id++) {
            authenticate("user" + id + "@example.com", id);
            assertEquals(429, invoke(filter, chain).getStatus());
        }

        AtomicLong totalRequests = (AtomicLong) ReflectionTestUtils.getField(filter, "totalRequests");
        Map<?, ?> buckets = (Map<?, ?>) ReflectionTestUtils.getField(filter, "userLimits");
        assertEquals(2, totalRequests.get());
        assertEquals(1, buckets.size());
    }

    @Test
    void identityBucketCapacityRejectsFreshAccountsWithoutGrowingMap() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 100, 500);
        ReflectionTestUtils.setField(filter, "maxUserBuckets", 2);
        FilterChain chain = mock(FilterChain.class);

        authenticate("one@example.com", 1L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("two@example.com", 2L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("three@example.com", 3L);
        assertEquals(429, invoke(filter, chain).getStatus());

        Map<?, ?> buckets = (Map<?, ?>) ReflectionTestUtils.getField(filter, "userLimits");
        assertEquals(2, buckets.size());
    }

    @Test
    void anonymousRequestsCannotConsumeAuthenticatedGlobalBudget() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 1);
        FilterChain chain = mock(FilterChain.class);

        SecurityContextHolder.clearContext();
        for (int i = 0; i < 5; i++) {
            assertEquals(401, invoke(filter, chain).getStatus());
        }

        authenticate("user@example.com", 1L);
        assertEquals(200, invoke(filter, chain).getStatus());
        verify(chain, times(1)).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void nonOAuthAuthenticatedPrincipalIsRejectedWithoutCallingAiController() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 500);
        FilterChain chain = mock(FilterChain.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("unexpected-principal", null, List.of()));

        assertEquals(401, invoke(filter, chain).getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void OAuthPrincipalWithoutEmailIsRejectedWithoutCallingAiController() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 1);
        FilterChain chain = mock(FilterChain.class);
        OidcUser principal = mock(OidcUser.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));

        assertEquals(401, invoke(filter, chain).getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void OidcPrincipalWithUnverifiedEmailIsRejected() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 500);
        FilterChain chain = mock(FilterChain.class);
        OidcUser principal = mock(OidcUser.class);
        when(principal.getEmail()).thenReturn("unverified@example.com");
        when(principal.getEmailVerified()).thenReturn(false);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));

        assertEquals(401, invoke(filter, chain).getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void OidcPrincipalWithoutSubjectIsRejected() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 500);
        FilterChain chain = mock(FilterChain.class);
        OidcUser principal = mock(OidcUser.class);
        when(principal.getEmail()).thenReturn("user@example.com");
        when(principal.getEmailVerified()).thenReturn(true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));

        assertEquals(401, invoke(filter, chain).getStatus());
        verifyNoInteractions(chain);
    }

    @Test
    void globalDailyRejectionDoesNotConsumeOtherGlobalWindows() throws Exception {
        AiRateLimitingFilter filter = configuredFilter(100, 100, 10, 1);
        ReflectionTestUtils.setField(filter, "globalMinuteLimit", 2);
        FilterChain chain = mock(FilterChain.class);

        authenticate("one@example.com", 1L);
        assertEquals(200, invoke(filter, chain).getStatus());
        authenticate("two@example.com", 2L);
        assertEquals(429, invoke(filter, chain).getStatus());

        Object globalDaily = ReflectionTestUtils.getField(filter, "globalDaily");
        AtomicInteger dailyCount = (AtomicInteger) ReflectionTestUtils.getField(globalDaily, "count");
        dailyCount.set(0);
        AtomicReference<?> cooldown = (AtomicReference<?>) ReflectionTestUtils.getField(filter, "globalCooldown");
        cooldown.set(null);

        authenticate("three@example.com", 3L);
        assertEquals(200, invoke(filter, chain).getStatus());
    }

    @Test
    void concurrentRequestsCannotExceedMinuteLimit() throws Exception {
        OidcUser principal = mock(OidcUser.class);
        when(principal.getEmail()).thenReturn("user@example.com");
        when(principal.getEmailVerified()).thenReturn(true);
        when(principal.getSubject()).thenReturn("1");
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, List.of());
        AiRateLimitingFilter filter = configuredFilter(3, 100, 100, 500);
        FilterChain chain = mock(FilterChain.class);
        ExecutorService executor = Executors.newFixedThreadPool(20);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();

        try {
            for (int i = 0; i < 20; i++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    try {
                        return invoke(filter, chain).getStatus();
                    } finally {
                        SecurityContextHolder.clearContext();
                    }
                }));
            }
            start.countDown();

            int accepted = 0;
            for (Future<Integer> future : futures) {
                if (future.get() == 200) {
                    accepted++;
                }
            }
            assertEquals(3, accepted);
            verify(chain, times(3)).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        } finally {
            executor.shutdownNow();
        }
    }

    private AiRateLimitingFilter configuredFilter(int userMinute, int userHourly,
                                                  int userDaily, int globalDaily) {
        AiRateLimitingFilter filter = new AiRateLimitingFilter();
        ReflectionTestUtils.setField(filter, "authMinuteLimit", userMinute);
        ReflectionTestUtils.setField(filter, "authHourlyLimit", userHourly);
        ReflectionTestUtils.setField(filter, "authDailyLimit", userDaily);
        ReflectionTestUtils.setField(filter, "globalMinuteLimit", 100);
        ReflectionTestUtils.setField(filter, "globalHourlyLimit", 100);
        ReflectionTestUtils.setField(filter, "globalDailyLimit", globalDaily);
        ReflectionTestUtils.setField(filter, "maxUserBuckets", 1000);
        return filter;
    }

    private void authenticate(String email, long ignoredId) {
        OidcUser principal = mock(OidcUser.class);
        when(principal.getEmail()).thenReturn(email);
        when(principal.getEmailVerified()).thenReturn(true);
        when(principal.getSubject()).thenReturn(Long.toString(ignoredId));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }

    private MockHttpServletResponse invoke(AiRateLimitingFilter filter, FilterChain chain) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/insights/stream");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);
        return response;
    }
}
