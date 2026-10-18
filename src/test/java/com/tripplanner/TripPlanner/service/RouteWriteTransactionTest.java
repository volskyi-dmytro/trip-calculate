package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.repository.*;
import com.tripplanner.TripPlanner.routing.RoutingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.*;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@DataJpaTest(properties = {"spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false"})
@Import({RouteService.class, RouteSaveLimiter.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class RouteWriteTransactionTest {
    @Autowired RouteService service;
    @Autowired RouteRepository routes;
    @Autowired WaypointRepository waypoints;
    @Autowired PlatformTransactionManager manager;
    @Autowired EntityManagerFactory emf;
    @Autowired DataSource dataSource;
    @MockBean RoutingService routing;

    @Test void updateRoutesOutsideTransactionAndRejectsConcurrentStateWithoutLosingWaypoints() {
        when(routing.calculateRoute(any())).thenReturn(Map.of("quality", "road", "totalDistance", 540));
        RouteDTO original = service.saveRoute(RouteCostContractTest.request(), 101L);
        java.util.List<Long> childIds = original.getWaypoints().stream().map(WaypointDTO::getId).toList();
        reset(routing);
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            TransactionTemplate other = new TransactionTemplate(manager);
            other.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            other.execute(s -> {
                var current = routes.findById(original.getId()).orElseThrow();
                current.setName("Concurrent winner");
                routes.saveAndFlush(current); return null;
            });
            return Map.of("quality", "road", "totalDistance", 545);
        });
        assertThatThrownBy(() -> service.updateRoute(original.getId(), RouteCostContractTest.request(), 101L))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode().value()).isEqualTo(409);
                    assertThat(ex.getReason()).isEqualTo("ROUTE_CHANGED");
                });
        RouteDTO current = service.getRoute(original.getId(), 101L);
        assertThat(current.getName()).isEqualTo("Concurrent winner");
        assertThat(current.getWaypoints().stream().map(WaypointDTO::getId).toList()).isEqualTo(childIds);
        verify(routing, times(1)).calculateRoute(any());
    }

    @Test void successfulUpdateDeletesOrphansAndReturnsInitializedDto() {
        road();
        RouteDTO before = service.saveRoute(RouteCostContractTest.request(), 110L);
        RouteDTO result = service.updateRoute(before.getId(), RouteCostContractTest.request(), 110L);
        assertThat(result.getWaypoints()).hasSize(2);
        assertThat(result.getUpdatedAt()).isAfterOrEqualTo(before.getUpdatedAt());
        for (WaypointDTO old : before.getWaypoints()) assertThat(waypoints.existsById(old.getId())).isFalse();
        for (WaypointDTO current : result.getWaypoints()) assertThat(waypoints.existsById(current.getId())).isTrue();
        RouteDTO reloaded = service.getRoute(before.getId(), 110L);
        assertThat(reloaded.getTotalCost()).isEqualTo(result.getTotalCost());
        assertThat(reloaded.getWaypoints().stream().map(WaypointDTO::getId).toList())
                .isEqualTo(result.getWaypoints().stream().map(WaypointDTO::getId).toList());
        verify(routing, times(2)).calculateRoute(any());
    }

    @Test void failedOwnedUpdateRollsBackClearedChildrenAndReleasesLease() {
        road();
        RouteDTO saved = service.saveRoute(RouteCostContractTest.request(), 111L);
        RouteDTO before = service.getRoute(saved.getId(), 111L);
        SaveRouteRequest invalid = RouteCostContractTest.request();
        invalid.getWaypoints().get(1).setName(null); // rejected by the real DB during child insertion
        assertThatThrownBy(() -> service.updateRoute(before.getId(), invalid, 111L)).isInstanceOf(RuntimeException.class);
        assertThat(service.getRoute(before.getId(), 111L)).isEqualTo(before);
        for (WaypointDTO old : before.getWaypoints()) assertThat(waypoints.existsById(old.getId())).isTrue();
        assertThat(service.updateRoute(before.getId(), RouteCostContractTest.request(), 111L).getWaypoints()).hasSize(2);
    }

    @Test void foreignAndMissingUpdatesRejectBeforeProviderAndReleaseLease() {
        road();
        RouteDTO before = service.saveRoute(RouteCostContractTest.request(), 112L);
        reset(routing);
        assertNotFound(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 113L));
        assertNotFound(() -> service.updateRoute(-1L, RouteCostContractTest.request(), 113L));
        verifyNoInteractions(routing);
    }

    @Test void deletionInFlightIsNotResurrected() {
        road();
        RouteDTO before = service.saveRoute(RouteCostContractTest.request(), 114L);
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            service.deleteRoute(before.getId(), 114L);
            return Map.of("quality", "road", "totalDistance", 540);
        });
        assertNotFound(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 114L));
        assertThat(routes.existsById(before.getId())).isFalse();
        for (WaypointDTO old : before.getWaypoints()) assertThat(waypoints.existsById(old.getId())).isFalse();
    }

    @Test void ownershipChangeInFlightIsNotOverwritten() {
        road();
        RouteDTO before = service.saveRoute(RouteCostContractTest.request(), 115L);
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            new TransactionTemplate(manager).execute(s -> {
                var route = routes.findById(before.getId()).orElseThrow();
                route.setUserId(116L); routes.saveAndFlush(route); return null;
            });
            return Map.of("quality", "road", "totalDistance", 540);
        });
        assertNotFound(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 115L));
        assertThat(service.getRoute(before.getId(), 116L).getWaypoints()).hasSize(2);
    }

    @Test void snapshotFailureAndNoRouteReleaseAdmissionWithoutMutatingOwnedRoute() {
        road();
        RouteDTO saved = service.saveRoute(RouteCostContractTest.request(), 117L);
        RouteDTO before = service.getRoute(saved.getId(), 117L);
        SaveRouteRequest request = RouteCostContractTest.request();
        SaveRouteRequest.Snapshot snapshot = new SaveRouteRequest.Snapshot();
        snapshot.setQuality("road"); snapshot.setDistanceKm(new java.math.BigDecimal("540")); request.setSnapshot(snapshot);
        when(routing.calculateRoute(any())).thenReturn(Map.of("quality", "road", "totalDistance", 545));
        assertThatThrownBy(() -> service.updateRoute(before.getId(), request, 117L))
            .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                e -> assertThat(e.getReason()).isEqualTo("ROUTE_SNAPSHOT_STALE"));
        assertThat(service.getRoute(before.getId(), 117L)).isEqualTo(before);
        when(routing.calculateRoute(any())).thenReturn(Map.of("noRoute", true));
        assertThatThrownBy(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 117L))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(service.getRoute(before.getId(), 117L)).isEqualTo(before);
        road();
        assertThat(service.updateRoute(before.getId(), request, 117L).getTotalDistance()).isEqualByComparingTo("540");
    }

    @Test void globalAndUserBusyAreFailFastWhileGetAndDeleteRemainAvailable() throws Exception {
        road();
        RouteDTO before = service.saveRoute(RouteCostContractTest.request(), 201L);
        reset(routing);
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(4);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        java.util.List<java.util.concurrent.Future<RouteDTO>> futures = new java.util.ArrayList<>();
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(dataSource)).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
            entered.countDown();
            assertThat(release.await(15, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            return Map.of("quality", "road", "totalDistance", 540);
        });
        try {
            for (long user = 201; user <= 204; user++) {
                long id = user;
                futures.add(pool.submit(() -> service.saveRoute(RouteCostContractTest.request(), id)));
            }
            assertThat(entered.await(15, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertBusy(() -> service.saveRoute(RouteCostContractTest.request(), 201L));
            assertBusy(() -> service.saveRoute(RouteCostContractTest.request(), 205L));
            assertBusy(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 201L));
            assertThat(service.getRoute(before.getId(), 201L).getWaypoints()).hasSize(2);
            service.deleteRoute(before.getId(), 201L);
            assertThat(routes.existsById(before.getId())).isFalse();
        } finally {
            release.countDown();
            pool.shutdown();
            assertThat(pool.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
        for (var future : futures) assertThat(future.get().getWaypoints()).hasSize(2);
        verify(routing, times(4)).calculateRoute(any());
        road();
        assertThat(service.saveRoute(RouteCostContractTest.request(), 201L).getId()).isNotNull();
    }

    @jakarta.persistence.PersistenceContext jakarta.persistence.EntityManager em;

    // QA F7: a stale client (older updatedAt than the stored row) must not overwrite a newer edit,
    // even though no write overlaps in time.
    @Test void staleExpectedUpdatedAtIsRejectedBeforeRoutingAndMatchingOneIsAccepted() throws Exception {
        road();
        RouteDTO v1 = service.saveRoute(RouteCostContractTest.request(), 140L);
        Thread.sleep(20); // distinct millisecond for the second write
        service.updateRoute(v1.getId(), RouteCostContractTest.request(), 140L); // "other tab" writes: updatedAt moves on
        RouteDTO v2 = service.getRoute(v1.getId(), 140L);
        org.mockito.Mockito.clearInvocations(routing);

        var stale = RouteCostContractTest.request();
        stale.setExpectedUpdatedAt(v1.getUpdatedAt().atZone(java.time.ZoneId.systemDefault()).toInstant());
        assertThatThrownBy(() -> service.updateRoute(v1.getId(), stale, 140L))
            .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                e -> assertThat(e.getReason()).isEqualTo("ROUTE_CHANGED"));
        verify(routing, never()).calculateRoute(any()); // fails fast, no provider quota spent

        var fresh = RouteCostContractTest.request();
        fresh.setExpectedUpdatedAt(v2.getUpdatedAt().atZone(java.time.ZoneId.systemDefault()).toInstant());
        assertThat(service.updateRoute(v1.getId(), fresh, 140L).getId()).isEqualTo(v1.getId());

        // Clients that send no version keep the previous behaviour.
        assertThat(service.updateRoute(v1.getId(), RouteCostContractTest.request(), 140L).getId()).isEqualTo(v1.getId());
    }

    @Test void waypointChangeWithoutRootTimestampChangeIsStillAConflict() {
        road();
        RouteDTO saved = service.saveRoute(RouteCostContractTest.request(), 118L);
        RouteDTO before = service.getRoute(saved.getId(), 118L);
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            new TransactionTemplate(manager).execute(s -> {
                em.createQuery("update Waypoint w set w.name = :name where w.id = :id")
                    .setParameter("name", "Changed waypoint")
                    .setParameter("id", before.getWaypoints().get(0).getId()).executeUpdate();
                return null;
            });
            return Map.of("quality", "road", "totalDistance", 540);
        });
        assertThatThrownBy(() -> service.updateRoute(before.getId(), RouteCostContractTest.request(), 118L))
            .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                e -> assertThat(e.getReason()).isEqualTo("ROUTE_CHANGED"));
        RouteDTO current = service.getRoute(before.getId(), 118L);
        assertThat(current.getUpdatedAt()).isEqualTo(before.getUpdatedAt());
        assertThat(current.getWaypoints().get(0).getName()).isEqualTo("Changed waypoint");
    }

    @Test void independentWritersCannotOverwriteWinnerAfterRoutingInFlight() throws Exception {
        road();
        RouteDTO saved = service.saveRoute(RouteCostContractTest.request(), 119L);
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicBoolean first = new java.util.concurrent.atomic.AtomicBoolean(true);
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            if (first.getAndSet(false)) {
                entered.countDown();
                assertThat(release.await(15, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                return Map.of("quality", "road", "totalDistance", 545);
            }
            return Map.of("quality", "road", "totalDistance", 550);
        });
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newSingleThreadExecutor();
        var loser = pool.submit(() -> service.updateRoute(saved.getId(), RouteCostContractTest.request(), 119L));
        try {
            assertThat(entered.await(15, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            // Separate admission instance models another application process; DB protection must still hold.
            RouteService other = new RouteService(routes, waypoints, routing, manager, new RouteSaveLimiter(4,1), emf);
            SaveRouteRequest winner = RouteCostContractTest.request(); winner.setName("Winner");
            assertThat(other.updateRoute(saved.getId(), winner, 119L).getTotalDistance()).isEqualByComparingTo("550");
            release.countDown();
            assertThatThrownBy(() -> loser.get(15, java.util.concurrent.TimeUnit.SECONDS))
                .hasCauseInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .satisfies(ex -> assertThat(((org.springframework.web.server.ResponseStatusException) ex.getCause()).getReason())
                    .isEqualTo("ROUTE_CHANGED"));
            RouteDTO current = service.getRoute(saved.getId(), 119L);
            assertThat(current.getName()).isEqualTo("Winner");
            assertThat(current.getTotalDistance()).isEqualByComparingTo("550");
        } finally {
            release.countDown(); pool.shutdown();
            assertThat(pool.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test void requestBoundPersistenceContextCannotHideConcurrentChanges() throws Exception {
        road();
        RouteDTO saved = service.saveRoute(RouteCostContractTest.request(), 120L);
        jakarta.persistence.EntityManager requestContext = emf.createEntityManager();
        // Reproduce OSIV: an EntityManager is bound to the request even without a transaction.
        TransactionSynchronizationManager.bindResource(emf, new org.springframework.orm.jpa.EntityManagerHolder(requestContext));
        try {
            requestContext.find(com.tripplanner.TripPlanner.entity.Route.class, saved.getId());
            when(routing.calculateRoute(any())).thenAnswer(i -> {
                assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
                assertThat(TransactionSynchronizationManager.hasResource(dataSource)).isFalse();
                var pool = java.util.concurrent.Executors.newSingleThreadExecutor();
                try {
                    pool.submit(() -> new TransactionTemplate(manager).execute(s -> {
                        var current = routes.findById(saved.getId()).orElseThrow();
                        current.setName("External winner"); routes.saveAndFlush(current); return null;
                    })).get(10, java.util.concurrent.TimeUnit.SECONDS);
                } finally { pool.shutdown(); }
                return Map.of("quality", "road", "totalDistance", 545);
            });
            assertThatThrownBy(() -> service.updateRoute(saved.getId(), RouteCostContractTest.request(), 120L))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                    e -> assertThat(e.getReason()).isEqualTo("ROUTE_CHANGED"));
        } finally {
            TransactionSynchronizationManager.unbindResource(emf);
            requestContext.close();
        }
        assertThat(service.getRoute(saved.getId(), 120L).getName()).isEqualTo("External winner");
    }

    private void road() {
        when(routing.calculateRoute(any())).thenReturn(Map.of("quality", "road", "totalDistance", 540));
    }
    private void assertNotFound(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, e -> {
            assertThat(e.getStatusCode().value()).isEqualTo(404);
            assertThat(e.getReason()).isEqualTo("Route not found");
        });
    }
    private void assertBusy(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class, e -> {
            assertThat(e.getStatusCode().value()).isEqualTo(429);
            assertThat(e.getReason()).isEqualTo("ROUTE_SAVE_BUSY");
        });
    }

    @Test void ambientTransactionIsSuspendedAndProviderHasNoDatabaseResources() {
        when(routing.calculateRoute(any())).thenAnswer(i -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(emf)).isFalse();
            assertThat(TransactionSynchronizationManager.hasResource(dataSource)).isFalse();
            return Map.of("quality", "road", "totalDistance", 540);
        });
        new TransactionTemplate(manager).execute(s -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            RouteDTO dto = service.saveRoute(RouteCostContractTest.request(), 100L);
            assertThat(dto.getWaypoints()).hasSize(2);
            assertThat(service.updateRoute(dto.getId(), RouteCostContractTest.request(), 100L).getWaypoints()).hasSize(2);
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            return null;
        });
        verify(routing, times(2)).calculateRoute(any());
    }
}
