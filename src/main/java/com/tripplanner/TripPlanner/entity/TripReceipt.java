package com.tripplanner.TripPlanner.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Immutable snapshot of a calculated trip, shared via /r/{slug}.
 * Deliberately separate from Route: editing a saved route must never
 * change what an already-shared receipt link shows.
 */
@Entity
@Table(name = "trip_receipts", indexes = {
        @Index(name = "idx_trip_receipts_slug", columnList = "slug", unique = true),
        @Index(name = "idx_trip_receipts_user_id", columnList = "user_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TripReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 8)
    private String slug;

    @Column(name = "origin_label", length = 120)
    private String originLabel;

    @Column(name = "destination_label", length = 120)
    private String destinationLabel;

    @Column(name = "distance_km", nullable = false, precision = 12, scale = 2)
    private BigDecimal distanceKm;

    @Column(name = "fuel_consumption", nullable = false, precision = 12, scale = 2)
    private BigDecimal fuelConsumption;

    @Column(name = "fuel_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal fuelPrice;

    @Column(nullable = false, length = 3)
    private String currency;

    /** Total people splitting the cost (driver included). */
    @Column(nullable = false)
    private Integer people;

    @Column(name = "total_cost", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalCost;

    @Column(name = "cost_per_person", nullable = false, precision = 12, scale = 2)
    private BigDecimal costPerPerson;

    @Column(nullable = false, length = 5)
    private String locale;

    /** JSON array of [lat, lng] pairs; null when shared from the plain calculator. */
    @Column(name = "route_geometry", columnDefinition = "TEXT")
    private String routeGeometry;

    /** Null for anonymous receipts. */
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Null = never expires (authenticated owner). */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "view_count", nullable = false)
    private Long viewCount = 0L;

    @Column(name = "cta_click_count", nullable = false)
    private Long ctaClickCount = 0L;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
