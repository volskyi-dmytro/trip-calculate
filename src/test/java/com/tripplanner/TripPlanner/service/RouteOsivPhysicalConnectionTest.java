package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.controller.RouteController;
import com.tripplanner.TripPlanner.dto.RouteDTO;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.UserRepository;
import com.tripplanner.TripPlanner.routing.RoutingService;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.ServletWebRequest;

import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({RouteService.class, RouteSaveLimiter.class, UserService.class, RouteController.class,
        RouteOsivPhysicalConnectionTest.PoolConfiguration.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class RouteOsivPhysicalConnectionTest {
    @TestConfiguration
    static class PoolConfiguration {
        @Bean(destroyMethod = "close") HikariDataSource dataSource(org.springframework.core.env.Environment environment) {
            HikariDataSource pool = new HikariDataSource();
            // Default test properties use H2; parent verification supplies the
            // same class an isolated PostgreSQL URL/credentials without editing it.
            pool.setJdbcUrl(environment.getRequiredProperty("spring.datasource.url"));
            pool.setUsername(environment.getProperty("spring.datasource.username", "sa"));
            pool.setPassword(environment.getProperty("spring.datasource.password", ""));
            pool.setMaximumPoolSize(4);
            return pool;
        }
    }

    @Autowired HikariDataSource pool;
    @Autowired EntityManagerFactory emf;
    @Autowired UserRepository users;
    @Autowired RouteController controller;
    @Autowired RouteService routes;
    @SpyBean UserService userService;
    @MockBean RoutingService routing;

    @Test void createReleasesLookupConnectionWhileProviderIsBlocked() throws Exception {
        controllerRequest(false);
    }

    @Test void updateReleasesLookupAndBaselineConnectionsWhileProviderIsBlocked() throws Exception {
        controllerRequest(true);
    }

    private void controllerRequest(boolean update) throws Exception {
        String subject = "physical-" + update;
        User user = users.saveAndFlush(User.builder().googleId(subject).email(subject + "@example.test")
                .name("Physical counter").role(com.tripplanner.TripPlanner.entity.UserRole.USER).build());
        when(routing.calculateRoute(any())).thenReturn(Map.of("quality", "road", "totalDistance", 540));
        RouteDTO original = update ? routes.saveRoute(RouteCostContractTest.request(), user.getId()) : null;
        assertThat(active()).isZero();
        AtomicInteger afterLookup = new AtomicInteger(-1);
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            afterLookup.set(active());
            return result;
        }).when(userService).findIdByGoogleId(subject);
        OAuth2User principal = mock(OAuth2User.class);
        when(principal.getAttribute("sub")).thenReturn(subject);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(routing.calculateRoute(any())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
            entered.countDown();
            assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
            return Map.of("quality", "road", "totalDistance", 540);
        });
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<RouteDTO> result = executor.submit(() -> {
            OpenEntityManagerInViewInterceptor osiv = new OpenEntityManagerInViewInterceptor();
            osiv.setEntityManagerFactory(emf);
            ServletWebRequest request = new ServletWebRequest(new MockHttpServletRequest());
            osiv.preHandle(request);
            EntityManagerHolder owner = (EntityManagerHolder) TransactionSynchronizationManager.getResource(emf);
            try {
                RouteDTO dto = update
                        ? controller.updateRoute(original.getId(), RouteCostContractTest.request(), principal).getBody()
                        : controller.createRoute(RouteCostContractTest.request(), principal).getBody();
                assertThat(TransactionSynchronizationManager.getResource(emf)).isSameAs(owner);
                assertThat(owner.getEntityManager().isOpen()).isTrue();
                return dto;
            } finally {
                // Only the real OSIV owner closes its context, never application code.
                osiv.afterCompletion(request, null);
                assertThat(owner.getEntityManager().isOpen()).isFalse();
                assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
            }
        });
        try {
            assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
            System.out.printf("OSIV_PHYSICAL operation=%s afterLookup=%d providerBlocked=%d%n",
                    update ? "update" : "create", afterLookup.get(), active());
            assertThat(active()).as("physical borrowed connections while controller routing is blocked").isZero();
        } finally {
            release.countDown();
            executor.shutdown();
            assertThat(executor.awaitTermination(20, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(result.get(1, TimeUnit.SECONDS).getWaypoints()).hasSize(2);
        assertThat(active()).isZero();
        verify(userService).findIdByGoogleId(subject);
        System.out.printf("OSIV_PHYSICAL operation=%s completed=%d ownerRestoredAndClosed=true%n",
                update ? "update" : "create", active());
    }

    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;

    @Test void legacyEntityLookupReallyRetainsPhysicalConnectionUntilOsivOwnerCloses() {
        OpenEntityManagerInViewInterceptor osiv = new OpenEntityManagerInViewInterceptor();
        osiv.setEntityManagerFactory(emf);
        ServletWebRequest request = new ServletWebRequest(new MockHttpServletRequest());
        osiv.preHandle(request);
        EntityManagerHolder owner = (EntityManagerHolder) TransactionSynchronizationManager.getResource(emf);
        try {
            userService.findByGoogleId("legacy-missing-user");
            assertThat(active()).isEqualTo(1);
            Object suspended = TransactionSynchronizationManager.unbindResource(emf);
            try {
                assertThat(active()).as("unbinding does not return the physical connection").isEqualTo(1);
                System.out.printf("OSIV_PHYSICAL legacyLookup=1 unboundStillBorrowed=%d%n", active());
            } finally {
                TransactionSynchronizationManager.bindResource(emf, suspended);
            }
            assertThat(TransactionSynchronizationManager.getResource(emf)).isSameAs(owner);
            assertThat(owner.getEntityManager().isOpen()).isTrue();
        } finally {
            osiv.afterCompletion(request, null);
        }
        assertThat(active()).isZero();
    }

    @Test void callerOwnedTransactionKeepsItsConnectionAndRollsBackNormally() {
        when(routing.calculateRoute(any())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
            assertThat(active()).as("suspended caller connection is not operation-owned").isEqualTo(1);
            System.out.printf("OSIV_PHYSICAL suspendedCallerBorrowed=%d operationOwnedBorrowed=0%n", active());
            return Map.of("quality", "road", "totalDistance", 540);
        });
        new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status -> {
            Object owner = TransactionSynchronizationManager.getResource(emf);
            User uncommitted = users.saveAndFlush(User.builder().googleId("caller-rollback")
                    .email("caller@example.test").name("Caller")
                    .role(com.tripplanner.TripPlanner.entity.UserRole.USER).build());
            assertThat(active()).isEqualTo(1);
            assertThat(routes.saveRoute(RouteCostContractTest.request(), uncommitted.getId()).getId()).isNotNull();
            assertThat(TransactionSynchronizationManager.getResource(emf)).isSameAs(owner);
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            assertThat(users.findById(uncommitted.getId())).isPresent();
            status.setRollbackOnly();
            return null;
        });
        assertThat(users.findByGoogleId("caller-rollback")).isEmpty();
        assertThat(active()).isZero();
    }

    private int active() {
        return pool.getHikariPoolMXBean().getActiveConnections();
    }
}
