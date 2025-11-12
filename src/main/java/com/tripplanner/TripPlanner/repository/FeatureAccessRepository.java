package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.FeatureAccess;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface FeatureAccessRepository extends JpaRepository<FeatureAccess, Long> {
    Optional<FeatureAccess> findByUserId(Long userId);

    long countByRoutePlannerEnabled(Boolean enabled);
}
