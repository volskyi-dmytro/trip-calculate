package com.tripplanner.TripPlanner.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "google_id", unique = true, nullable = false)
    private String googleId;

    @Column(name = "email", unique = true, nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    @Column(name = "picture_url", length = 512)
    private String pictureUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "last_login")
    private LocalDateTime lastLogin;

    @Column(name = "role", nullable = false)
    @Enumerated(EnumType.STRING)
    private UserRole role = UserRole.USER;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "preferred_language", length = 5)
    private String preferredLanguage = "en";

    @Column(name = "default_fuel_consumption")
    private Double defaultFuelConsumption = 7.0;

    @Column(name = "email_notifications_enabled")
    private Boolean emailNotificationsEnabled = true;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (lastLogin == null) {
            lastLogin = LocalDateTime.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // Helper method to check if user is admin
    public boolean isAdmin() {
        return this.role == UserRole.ADMIN;
    }
}
