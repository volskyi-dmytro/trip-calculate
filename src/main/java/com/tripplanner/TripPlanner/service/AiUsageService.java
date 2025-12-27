package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.AiUsageLog;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.AiUsageLogRepository;
import com.tripplanner.TripPlanner.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service for logging and analyzing AI usage
 */
@Service
@RequiredArgsConstructor
public class AiUsageService {

    private static final Logger logger = LoggerFactory.getLogger(AiUsageService.class);

    private final AiUsageLogRepository aiUsageLogRepository;
    private final UserRepository userRepository;

    /**
     * Log an AI request
     * @return The log ID for subsequent status updates
     */
    @Transactional
    public Long logRequest(Long userId, String userEmail, String ipAddress, String prompt, String language) {
        // If userId is null but email is provided, try to fetch userId
        if (userId == null && userEmail != null) {
            Optional<User> user = userRepository.findByEmail(userEmail);
            if (user.isPresent()) {
                userId = user.get().getId();
            }
        }

        AiUsageLog log = AiUsageLog.builder()
                .userId(userId)
                .userEmail(userEmail)
                .ipAddress(ipAddress)
                .prompt(truncatePrompt(prompt))
                .promptLength(prompt.length())
                .language(language)
                .responseStatus("pending")
                .timestamp(LocalDateTime.now())
                .build();

        AiUsageLog saved = aiUsageLogRepository.save(log);
        logger.debug("Logged AI request: id={}, userId={}, promptLength={}",
                saved.getId(), userId, prompt.length());

        return saved.getId();
    }

    /**
     * Update log entry with response status
     */
    @Transactional
    public void logResponse(Long logId, String status, String errorMessage, long durationMs) {
        if (logId == null) {
            logger.warn("Cannot update log response: logId is null");
            return;
        }

        Optional<AiUsageLog> logOpt = aiUsageLogRepository.findById(logId);
        if (logOpt.isEmpty()) {
            logger.warn("Cannot update log response: log not found with id={}", logId);
            return;
        }

        AiUsageLog log = logOpt.get();
        log.setResponseStatus(status);
        log.setErrorMessage(errorMessage);
        log.setDurationMs(durationMs);

        aiUsageLogRepository.save(log);
        logger.debug("Updated AI response: id={}, status={}, duration={}ms", logId, status, durationMs);
    }

    /**
     * Get hourly request count for a user
     */
    public long getUserHourlyCount(Long userId) {
        LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
        return aiUsageLogRepository.countByUserIdAndTimestampAfter(userId, oneHourAgo);
    }

    /**
     * Get daily request count for a user
     */
    public long getUserDailyCount(Long userId) {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        return aiUsageLogRepository.countByUserIdAndTimestampAfter(userId, oneDayAgo);
    }

    /**
     * Get hourly request count for an IP address
     */
    public long getIpHourlyCount(String ipAddress) {
        LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
        return aiUsageLogRepository.countByIpAddressAndTimestampAfter(ipAddress, oneHourAgo);
    }

    /**
     * Get daily request count for an IP address
     */
    public long getIpDailyCount(String ipAddress) {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        return aiUsageLogRepository.countByIpAddressAndTimestampAfter(ipAddress, oneDayAgo);
    }

    /**
     * Get total AI requests in last 24 hours
     */
    public long getRequestsLast24h() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        return aiUsageLogRepository.countByTimestampAfter(oneDayAgo);
    }

    /**
     * Get total AI requests in last month
     */
    public long getRequestsLastMonth() {
        LocalDateTime oneMonthAgo = LocalDateTime.now().minusMonths(1);
        return aiUsageLogRepository.countByTimestampAfter(oneMonthAgo);
    }

    /**
     * Get unique AI users in last 24 hours
     */
    public long getUniqueUsersLast24h() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        return aiUsageLogRepository.countDistinctUsersByTimestampAfter(oneDayAgo);
    }

    /**
     * Get rate limit hits in last 24 hours
     */
    public long getRateLimitHitsLast24h() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        return aiUsageLogRepository.countByResponseStatusAndTimestampAfter("rate_limited", oneDayAgo);
    }

    /**
     * Calculate AI cache hit rate (based on success_cached vs success)
     */
    public double getCacheHitRate() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        long cachedRequests = aiUsageLogRepository.countByResponseStatusAndTimestampAfter("success_cached", oneDayAgo);
        long totalSuccessRequests = aiUsageLogRepository.countByResponseStatusAndTimestampAfter("success", oneDayAgo);
        long totalRequests = cachedRequests + totalSuccessRequests;

        if (totalRequests == 0) {
            return 0.0;
        }

        return (double) cachedRequests / totalRequests;
    }

    /**
     * Calculate AI error rate
     */
    public double getErrorRate() {
        LocalDateTime oneDayAgo = LocalDateTime.now().minusDays(1);
        long errorCount = aiUsageLogRepository.countErrorsByTimestampAfter(oneDayAgo);
        long totalRequests = aiUsageLogRepository.countByTimestampAfter(oneDayAgo);

        if (totalRequests == 0) {
            return 0.0;
        }

        return (double) errorCount / totalRequests;
    }

    /**
     * Get recent AI usage logs (for admin dashboard)
     */
    public List<AiUsageLog> getRecentUsage(int limit) {
        return aiUsageLogRepository.findAllByOrderByTimestampDesc(PageRequest.of(0, limit));
    }

    /**
     * Get daily aggregated stats for charts
     */
    public List<Object[]> getDailyStats(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return aiUsageLogRepository.getDailyStats(since);
    }

    /**
     * Get top users by AI request count
     */
    public List<Object[]> getTopUsers(int limit, int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return aiUsageLogRepository.getTopUsers(since, PageRequest.of(0, limit));
    }

    /**
     * Get top IP addresses by request count (for abuse detection)
     */
    public List<Object[]> getTopIpAddresses(int limit, int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return aiUsageLogRepository.getTopIpAddresses(since, PageRequest.of(0, limit));
    }

    /**
     * Truncate prompt to max length for storage
     */
    private String truncatePrompt(String prompt) {
        if (prompt == null) {
            return null;
        }
        if (prompt.length() <= 1000) {
            return prompt;
        }
        return prompt.substring(0, 997) + "...";
    }
}
