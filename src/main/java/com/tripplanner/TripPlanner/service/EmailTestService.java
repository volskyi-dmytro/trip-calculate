package com.tripplanner.TripPlanner.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailTestService {

    private final JavaMailSender mailSender;

    @Value("${app.admin.email}")
    private String adminEmail;

    @Value("${spring.mail.username:NOT_SET}")
    private String mailUsername;

    /**
     * Send a test email to verify email configuration
     */
    public void sendTestEmail() {
        log.info("=== Sending Test Email ===");
        log.info("From: {}", maskEmail(mailUsername));
        log.info("To: {}", maskEmail(adminEmail));

        // Validate configuration
        if (adminEmail == null || adminEmail.trim().isEmpty() || "NOT_SET".equals(adminEmail)) {
            String error = "ADMIN_EMAIL is not configured! Cannot send test email.";
            log.error(error);
            throw new RuntimeException(error);
        }

        if (mailUsername == null || mailUsername.trim().isEmpty() || "NOT_SET".equals(mailUsername)) {
            String error = "GMAIL_USERNAME is not configured! Cannot send test email.";
            log.error(error);
            throw new RuntimeException(error);
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(adminEmail);
            message.setSubject("Test Email from Trip Calculate - " +
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            message.setText(
                "This is a test email from Trip Calculate application.\n\n" +
                "Email configuration details:\n" +
                "- Sent from: " + mailUsername + "\n" +
                "- Sent to: " + adminEmail + "\n" +
                "- Timestamp: " + LocalDateTime.now() + "\n\n" +
                "If you received this email, your email notification system is working correctly!\n\n" +
                "This test was triggered from the Admin Dashboard."
            );

            log.info("Attempting to send test email via JavaMailSender...");
            mailSender.send(message);
            log.info("✓ Test email sent successfully!");
        } catch (Exception e) {
            log.error("❌ Failed to send test email. Error: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to send test email: " + e.getMessage(), e);
        }
    }

    /**
     * Mask email address for logging (security)
     */
    private String maskEmail(String email) {
        if (email == null || email.length() < 4) {
            return "***";
        }

        int atIndex = email.indexOf('@');
        if (atIndex <= 0) {
            return email.substring(0, Math.min(3, email.length())) + "***";
        }

        String localPart = email.substring(0, atIndex);
        String domain = email.substring(atIndex);

        if (localPart.length() <= 3) {
            return localPart.charAt(0) + "***" + domain;
        }

        return localPart.substring(0, 3) + "***" + domain;
    }
}
