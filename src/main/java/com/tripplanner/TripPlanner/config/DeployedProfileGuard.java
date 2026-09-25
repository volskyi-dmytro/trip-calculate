package com.tripplanner.TripPlanner.config;

import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;

import java.util.List;
import java.util.Set;

/**
 * Refuses to start a deployed container with a dangerous profile.
 *
 * <p>The Docker image sets {@code APP_DEPLOYED=true}. There, the active profiles
 * must be exactly {@code prod} or {@code staging}: without a profile the app
 * would run {@code ddl-auto=update} against the real database, and {@code dev}
 * switches authentication off. Local runs ({@code mvn spring-boot:run}) are
 * not affected.
 */
public class DeployedProfileGuard implements ApplicationListener<ApplicationEnvironmentPreparedEvent> {

    private static final Set<String> DEPLOYABLE_PROFILES = Set.of("prod", "staging");

    @Override
    public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
        check(event.getEnvironment());
    }

    static void check(Environment environment) {
        if (!environment.getProperty("app.deployed", Boolean.class, false)) {
            return;
        }
        List<String> active = List.of(environment.getActiveProfiles());
        if (active.size() != 1 || !DEPLOYABLE_PROFILES.contains(active.get(0))) {
            throw new IllegalStateException("Refusing to start a deployed container with profiles " + active
                    + ": set SPRING_PROFILES_ACTIVE to exactly one of " + DEPLOYABLE_PROFILES);
        }
    }
}
