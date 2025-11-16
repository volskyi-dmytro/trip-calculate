package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AccessRequestRepository extends JpaRepository<AccessRequest, Long> {
    List<AccessRequest> findByStatusOrderByRequestedAtDesc(AccessRequest.RequestStatus status);
    boolean existsByUserIdAndFeatureNameAndStatus(Long userId, String featureName, AccessRequest.RequestStatus status);
    List<AccessRequest> findByUserIdAndFeatureNameAndStatus(Long userId, String featureName, AccessRequest.RequestStatus status);
}
