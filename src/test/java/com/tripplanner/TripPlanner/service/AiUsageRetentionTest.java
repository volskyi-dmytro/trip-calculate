package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AiUsageRetentionTest {

    @Test
    void nightlyCleanupDeletesLogsOlderThanTheRetentionPeriod() {
        AiUsageLogRepository logs = mock(AiUsageLogRepository.class);
        AiUsageService service = new AiUsageService(logs, mock(UserRepository.class));

        service.deleteExpiredLogs();

        ArgumentCaptor<LocalDateTime> cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(logs).deleteOlderThan(cutoff.capture());
        Duration age = Duration.between(cutoff.getValue(), LocalDateTime.now());
        assertTrue(age.toDays() >= 89 && age.toDays() <= 90, "cutoff should be 90 days ago, was " + age);
    }
}
