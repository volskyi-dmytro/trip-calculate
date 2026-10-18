package com.tripplanner.TripPlanner.service;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

/** Unit-test transaction boundary; real boundaries are covered by RouteWriteTransactionTest. */
public final class RouteTestTransactions {
    private RouteTestTransactions() {}
    public static PlatformTransactionManager manager() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(i -> new SimpleTransactionStatus());
        return manager;
    }
}
