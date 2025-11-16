package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.*;
import com.tripplanner.TripPlanner.exception.DuplicateAccessRequestException;
import com.tripplanner.TripPlanner.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccessRequestService {
    private final AccessRequestRepository accessRequestRepository;
    private final FeatureAccessRepository featureAccessRepository;
    private final JavaMailSender mailSender;

    @Value("${app.admin.email}")
    private String adminEmail;

    @Transactional
    public void requestAccess(Long userId, String featureName, String userEmail, String userName) {
        // Check if already requested
        boolean alreadyRequested = accessRequestRepository.existsByUserIdAndFeatureNameAndStatus(
                userId, featureName, AccessRequest.RequestStatus.PENDING);

        if (alreadyRequested) {
            log.warn("Duplicate access request attempt for user ID: {}, feature: {}", userId, featureName);
            throw new DuplicateAccessRequestException(
                "You already have a pending request for this feature. " +
                "Please wait for admin approval. You will receive an email notification once your request is processed."
            );
        }

        AccessRequest request = new AccessRequest();
        request.setUserId(userId);
        request.setFeatureName(featureName);
        request.setUserEmail(userEmail);
        request.setUserName(userName);
        request.setStatus(AccessRequest.RequestStatus.PENDING);

        accessRequestRepository.save(request);
        log.info("Access request saved for user ID: {}, feature: {}", userId, featureName);

        // Send email notification to admin
        sendAccessRequestEmail(userId, userName, userEmail, featureName);

        // Send confirmation email to user
        sendPendingConfirmationEmail(userName, userEmail, featureName);
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

    private void sendAccessRequestEmail(Long userId, String userName, String userEmail, String featureName) {
        log.info("Attempting to send access request email for user ID: {}, feature: {}", userId, featureName);

        // Validate admin email is configured
        if (adminEmail == null || adminEmail.trim().isEmpty()) {
            log.error("ADMIN_EMAIL is not configured! Cannot send notification email. Check environment variable.");
            return;
        }

        log.debug("Admin email configured as: {}", adminEmail);

        try {
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

            log.info("Sending email to: {}", adminEmail);
            mailSender.send(message);
            log.info("Email sent successfully for user ID: {}", userId);
        } catch (Exception e) {
            // Log detailed error information
            log.error("Failed to send access request email notification for user ID: {}. Error type: {}, Message: {}",
                    userId, e.getClass().getName(), e.getMessage(), e);
        }
    }

    private void sendPendingConfirmationEmail(String userName, String userEmail, String featureName) {
        log.info("Sending pending confirmation email to user: {}", userEmail);

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(userEmail);
            message.setSubject("Beta Access Request Received - " + formatFeatureName(featureName));
            message.setText(String.format(
                    "Hello %s,\n\n" +
                    "Thank you for requesting beta access to %s!\n\n" +
                    "Your request has been received and is currently pending review. " +
                    "You will receive another email notification once your request has been processed.\n\n" +
                    "This usually takes 1-2 business days.\n\n" +
                    "If you have any questions, please don't hesitate to contact us.\n\n" +
                    "Best regards,\n" +
                    "Trip Planner Team",
                    userName, formatFeatureName(featureName)
            ));

            mailSender.send(message);
            log.info("Pending confirmation email sent successfully to: {}", userEmail);
        } catch (Exception e) {
            log.error("Failed to send pending confirmation email to user: {}. Error: {}",
                    userEmail, e.getMessage(), e);
        }
    }

    public void sendApprovalEmail(String userName, String userEmail, String featureName) {
        log.info("Sending approval notification email to user: {}", userEmail);

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(userEmail);
            message.setSubject("Beta Access Granted - " + formatFeatureName(featureName));
            message.setText(String.format(
                    "Hello %s,\n\n" +
                    "Great news! Your request for beta access to %s has been approved!\n\n" +
                    "You can now access this feature by logging into your account at our platform.\n\n" +
                    "We hope you enjoy using this new feature. If you encounter any issues or have feedback, " +
                    "please let us know.\n\n" +
                    "Best regards,\n" +
                    "Trip Planner Team",
                    userName, formatFeatureName(featureName)
            ));

            mailSender.send(message);
            log.info("Approval email sent successfully to: {}", userEmail);
        } catch (Exception e) {
            log.error("Failed to send approval email to user: {}. Error: {}",
                    userEmail, e.getMessage(), e);
        }
    }

    public void sendRejectionEmail(String userName, String userEmail, String featureName) {
        log.info("Sending rejection notification email to user: {}", userEmail);

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(userEmail);
            message.setSubject("Beta Access Request Update - " + formatFeatureName(featureName));
            message.setText(String.format(
                    "Hello %s,\n\n" +
                    "Thank you for your interest in beta access to %s.\n\n" +
                    "After careful consideration, we are unable to grant access at this time. " +
                    "This may be due to capacity limitations or other factors.\n\n" +
                    "We appreciate your interest and encourage you to check back in the future " +
                    "as we expand our beta program.\n\n" +
                    "If you have any questions, please don't hesitate to contact us.\n\n" +
                    "Best regards,\n" +
                    "Trip Planner Team",
                    userName, formatFeatureName(featureName)
            ));

            mailSender.send(message);
            log.info("Rejection email sent successfully to: {}", userEmail);
        } catch (Exception e) {
            log.error("Failed to send rejection email to user: {}. Error: {}",
                    userEmail, e.getMessage(), e);
        }
    }

    private String formatFeatureName(String featureName) {
        // Convert "route_planner" to "Route Planner"
        return featureName.replace("_", " ")
                .toLowerCase()
                .replaceAll("\\b(\\w)", match -> match.toUpperCase());
    }
}
