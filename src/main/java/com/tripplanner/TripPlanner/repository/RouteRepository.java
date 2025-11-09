package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.Route;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface RouteRepository extends JpaRepository<Route, Long> {
    List<Route> findByUserIdOrderByUpdatedAtDesc(Long userId);

    @Query("SELECT r FROM Route r LEFT JOIN FETCH r.waypoints WHERE r.id = :id AND r.userId = :userId")
    Optional<Route> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);
}
