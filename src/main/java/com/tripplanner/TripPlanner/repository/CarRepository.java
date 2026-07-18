package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.Car;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface CarRepository extends JpaRepository<Car, Long> {
    List<Car> findByUserIdOrderByIsDefaultDescUpdatedAtDesc(Long userId);
    Optional<Car> findByIdAndUserId(Long id, Long userId);
    Optional<Car> findByUserIdAndIsDefaultTrue(Long userId);
    Optional<Car> findFirstByUserIdOrderByUpdatedAtDesc(Long userId);
    long countByUserId(Long userId);
}
