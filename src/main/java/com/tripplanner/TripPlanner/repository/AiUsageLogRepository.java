package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.AiUsageLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AiUsageLogRepository extends JpaRepository<AiUsageLog, Long> {

    // Count requests by user ID within a time window
    long countByUserIdAndTimestampAfter(Long userId, LocalDateTime after);

    // Count requests by IP address within a time window
    long countByIpAddressAndTimestampAfter(String ipAddress, LocalDateTime after);

    // Get recent usage for a user
    List<AiUsageLog> findByUserIdOrderByTimestampDesc(Long userId, Pageable pageable);

    // Get recent usage for all users (admin dashboard)
    List<AiUsageLog> findAllByOrderByTimestampDesc(Pageable pageable);

    // Count total requests in a time period
    long countByTimestampAfter(LocalDateTime after);

    // Count unique users in a time period
    @Query("SELECT COUNT(DISTINCT al.userId) FROM AiUsageLog al WHERE al.userId IS NOT NULL AND al.timestamp > :after")
    long countDistinctUsersByTimestampAfter(@Param("after") LocalDateTime after);

    // Count rate limit hits in a time period
    long countByResponseStatusAndTimestampAfter(String responseStatus, LocalDateTime after);

    // Count errors in a time period
    @Query("SELECT COUNT(al) FROM AiUsageLog al WHERE al.responseStatus LIKE 'error%' AND al.timestamp > :after")
    long countErrorsByTimestampAfter(@Param("after") LocalDateTime after);

    // Get daily aggregated stats for charts
    @Query("SELECT DATE(al.timestamp) as day, COUNT(al) as count FROM AiUsageLog al " +
           "WHERE al.timestamp > :after GROUP BY DATE(al.timestamp) ORDER BY day DESC")
    List<Object[]> getDailyStats(@Param("after") LocalDateTime after);

    // Get top users by request count
    @Query("SELECT al.userId, al.userEmail, COUNT(al) as count FROM AiUsageLog al " +
           "WHERE al.userId IS NOT NULL AND al.timestamp > :after " +
           "GROUP BY al.userId, al.userEmail ORDER BY count DESC")
    List<Object[]> getTopUsers(@Param("after") LocalDateTime after, Pageable pageable);

    // Get top IP addresses by request count (for abuse detection)
    @Query("SELECT al.ipAddress, COUNT(al) as count FROM AiUsageLog al " +
           "WHERE al.timestamp > :after " +
           "GROUP BY al.ipAddress ORDER BY count DESC")
    List<Object[]> getTopIpAddresses(@Param("after") LocalDateTime after, Pageable pageable);
}
