package com.tripplanner.TripPlanner.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

@Configuration
@Slf4j
public class EmailConfiguration {

    @Value("${spring.mail.host:NOT_SET}")
    private String mailHost;

    @Value("${spring.mail.port:0}")
    private int mailPort;

    @Value("${spring.mail.username:NOT_SET}")
    private String mailUsername;

    @Value("${spring.mail.password:NOT_SET}")
    private String mailPassword;

    @Value("${app.admin.email:NOT_SET}")
    private String adminEmail;

    @Bean
    CommandLineRunner validateEmailConfiguration(JavaMailSender mailSender) {
        return args -> {
            log.info("========================================");
            log.info("Email Configuration Validation");
            log.info("========================================");

            boolean isValid = true;

            // Check SMTP host
            if ("NOT_SET".equals(mailHost) || mailHost.trim().isEmpty()) {
                log.error("❌ SMTP host is not configured (spring.mail.host)");
                isValid = false;
            } else {
                log.info("✓ SMTP host: {}", mailHost);
            }

            // Check SMTP port
            if (mailPort == 0) {
                log.error("❌ SMTP port is not configured (spring.mail.port)");
                isValid = false;
            } else {
                log.info("✓ SMTP port: {}", mailPort);
            }

            // Check mail username
            if ("NOT_SET".equals(mailUsername) || mailUsername.trim().isEmpty()) {
                log.error("❌ Mail username is not configured (GMAIL_USERNAME env var)");
                isValid = false;
            } else {
                // Mask email for security (show first 3 chars and domain)
                String masked = maskEmail(mailUsername);
                log.info("✓ Mail username: {}", masked);
            }

            // Check mail password
            if ("NOT_SET".equals(mailPassword) || mailPassword.trim().isEmpty()) {
                log.error("❌ Mail password is not configured (GMAIL_APP_PASSWORD env var)");
                isValid = false;
            } else {
                log.info("✓ Mail password: [SET - {} characters]", mailPassword.length());
            }

            // Check admin email
            if ("NOT_SET".equals(adminEmail) || adminEmail.trim().isEmpty()) {
                log.error("❌ Admin email is not configured (ADMIN_EMAIL env var)");
                isValid = false;
            } else {
                String masked = maskEmail(adminEmail);
                log.info("✓ Admin notification email: {}", masked);
            }

            // Check JavaMailSender bean
            if (mailSender == null) {
                log.error("❌ JavaMailSender bean is not initialized");
                isValid = false;
            } else {
                log.info("✓ JavaMailSender bean: initialized");
            }

            log.info("========================================");
            if (isValid) {
                log.info("✓ Email configuration is VALID - email notifications will work");
            } else {
                log.error("❌ Email configuration is INVALID - email notifications will FAIL!");
                log.error("Please check your environment variables and application.properties");
            }
            log.info("========================================");
        };
    }

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
