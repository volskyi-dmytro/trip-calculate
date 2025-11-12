package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.Route;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface RouteRepository extends JpaRepository<Route, Long> {
    List<Route> findByUserIdOrderByUpdatedAtDesc(Long userId);

    List<Route> findByUserIdOrderByUpdatedAtDesc(Long userId, Pageable pageable);

    @Query("SELECT r FROM Route r LEFT JOIN FETCH r.waypoints WHERE r.id = :id AND r.userId = :userId")
    Optional<Route> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);

    // Statistics queries
    @Query("SELECT COALESCE(SUM(r.totalDistance), 0) FROM Route r WHERE r.userId = :userId")
    BigDecimal sumTotalDistanceByUserId(@Param("userId") Long userId);

    @Query("SELECT COALESCE(SUM(r.totalCost), 0) FROM Route r WHERE r.userId = :userId")
    BigDecimal sumTotalCostByUserId(@Param("userId") Long userId);

    @Query("SELECT r.currency, COUNT(r) as cnt FROM Route r WHERE r.userId = :userId GROUP BY r.currency ORDER BY cnt DESC")
    List<Object[]> findMostUsedCurrencyByUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(r) FROM Route r JOIN r.waypoints w WHERE r.userId = :userId")
    Long countTotalWaypointsByUserId(@Param("userId") Long userId);
}
