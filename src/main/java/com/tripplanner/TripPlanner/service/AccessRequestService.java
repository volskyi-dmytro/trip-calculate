package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.*;
import com.tripplanner.TripPlanner.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AccessRequestService {
    private final AccessRequestRepository accessRequestRepository;
    private final FeatureAccessRepository featureAccessRepository;
    private final JavaMailSender mailSender;

    // TODO: Add your email from application.properties
    private final String adminEmail = "your-email@example.com";

    @Transactional
    public void requestAccess(Long userId, String featureName, String userEmail, String userName) {
        // Check if already requested
        boolean alreadyRequested = accessRequestRepository.existsByUserIdAndFeatureNameAndStatus(
                userId, featureName, AccessRequest.RequestStatus.PENDING);

        if (alreadyRequested) {
            throw new RuntimeException("Access request already pending");
        }

        AccessRequest request = new AccessRequest();
        request.setUserId(userId);
        request.setFeatureName(featureName);
        request.setUserEmail(userEmail);
        request.setUserName(userName);
        request.setStatus(AccessRequest.RequestStatus.PENDING);

        accessRequestRepository.save(request);

        // Send email notification to admin
        sendAccessRequestEmail(userName, userEmail, featureName);
    }

    @Transactional
    public void approveRequest(Long requestId, String approvedBy) {
        AccessRequest request = accessRequestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found"));

        request.setStatus(AccessRequest.RequestStatus.APPROVED);
        request.setProcessedAt(LocalDateTime.now());
        request.setProcessedBy(approvedBy);
        accessRequestRepository.save(request);

        // Grant feature access
        FeatureAccess access = featureAccessRepository.findByUserId(request.getUserId())
                .orElse(new FeatureAccess());
        access.setUserId(request.getUserId());
        access.setRoutePlannerEnabled(true);
        access.setGrantedAt(LocalDateTime.now());
        access.setGrantedBy(approvedBy);
        featureAccessRepository.save(access);
    }

    @Transactional
    public void rejectRequest(Long requestId, String rejectedBy) {
        AccessRequest request = accessRequestRepository.findById(requestId)
                .orElseThrow(() -> new RuntimeException("Request not found"));

        request.setStatus(AccessRequest.RequestStatus.REJECTED);
        request.setProcessedAt(LocalDateTime.now());
        request.setProcessedBy(rejectedBy);
        accessRequestRepository.save(request);
    }

    public List<AccessRequest> getPendingRequests() {
        return accessRequestRepository.findByStatusOrderByRequestedAtDesc(AccessRequest.RequestStatus.PENDING);
    }

    private void sendAccessRequestEmail(String userName, String userEmail, String featureName) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(adminEmail);
        message.setSubject("New Feature Access Request - " + featureName);
        message.setText(String.format(
                "New access request received:\n\n" +
                "User: %s\n" +
                "Email: %s\n" +
                "Feature: %s\n\n" +
                "Please review and approve/reject this request in the admin panel.",
                userName, userEmail, featureName
        ));

        try {
            mailSender.send(message);
        } catch (Exception e) {
            // Log error but don't fail the request
            System.err.println("Failed to send email notification: " + e.getMessage());
        }
    }
}
