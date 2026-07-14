package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.AccessRequest;
import com.tripplanner.TripPlanner.repository.AccessRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Read-only access to historical manual access requests.
 * Route Planner access is automatic for Google-authenticated users.
 */
@Service
@RequiredArgsConstructor
public class AccessRequestService {
    private final AccessRequestRepository accessRequestRepository;

    public List<AccessRequest> getPendingRequests() {
        return accessRequestRepository.findByStatusOrderByRequestedAtDesc(
                AccessRequest.RequestStatus.PENDING);
    }
}
