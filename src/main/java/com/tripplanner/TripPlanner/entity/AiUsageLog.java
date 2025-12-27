package com.tripplanner.TripPlanner.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Entity to track AI-powered trip insights usage for monitoring and cost control
 */
@Entity
@Table(name = "ai_usage_log", indexes = {
        @Index(name = "idx_user_timestamp", columnList = "user_id, timestamp"),
        @Index(name = "idx_ip_timestamp", columnList = "ip_address, timestamp"),
        @Index(name = "idx_timestamp", columnList = "timestamp")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiUsageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "user_email")
    private String userEmail;

    @Column(name = "ip_address", nullable = false, length = 45)
    private String ipAddress;

    @Column(name = "prompt", nullable = false, length = 1000)
    private String prompt;

    @Column(name = "prompt_length", nullable = false)
    private Integer promptLength;

    @Column(name = "language", nullable = false, length = 10)
    private String language;

    @Column(name = "response_status", nullable = false, length = 50)
    private String responseStatus;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @Column(name = "duration_ms")
    private Long durationMs;

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
        if (promptLength == null && prompt != null) {
            promptLength = prompt.length();
        }
    }
}
