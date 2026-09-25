package com.tripplanner.TripPlanner.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DeployedProfileGuardTest {

    private static MockEnvironment deployed(String... profiles) {
        MockEnvironment env = new MockEnvironment().withProperty("app.deployed", "true");
        env.setActiveProfiles(profiles);
        return env;
    }

    @Test
    void deployedContainerStartsWithProdOrStaging() {
        assertDoesNotThrow(() -> DeployedProfileGuard.check(deployed("prod")));
        assertDoesNotThrow(() -> DeployedProfileGuard.check(deployed("staging")));
    }

    @Test
    void deployedContainerRefusesToStartWithoutAProfile() {
        // No profile means ddl-auto=update against the production database.
        assertThrows(IllegalStateException.class, () -> DeployedProfileGuard.check(deployed()));
    }

    @Test
    void deployedContainerRefusesTheDevProfile() {
        // The dev profile turns off authentication.
        assertThrows(IllegalStateException.class, () -> DeployedProfileGuard.check(deployed("dev")));
        assertThrows(IllegalStateException.class, () -> DeployedProfileGuard.check(deployed("prod", "dev")));
        assertThrows(IllegalStateException.class, () -> DeployedProfileGuard.check(deployed("prod", "staging")));
    }

    @Test
    void localRunsAreNotRestricted() {
        MockEnvironment local = new MockEnvironment();
        local.setActiveProfiles("dev");
        assertDoesNotThrow(() -> DeployedProfileGuard.check(local));
        assertDoesNotThrow(() -> DeployedProfileGuard.check(new MockEnvironment()));
    }
}
