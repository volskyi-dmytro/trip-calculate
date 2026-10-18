package com.tripplanner.TripPlanner.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "routes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Route {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "fuel_consumption", nullable = false)
    private BigDecimal fuelConsumption = BigDecimal.valueOf(7.0);

    @Column(name = "fuel_cost_per_liter", nullable = false)
    private BigDecimal fuelCostPerLiter;

    @Column(nullable = false)
    private String currency = "UAH";

    @Column(name = "passenger_count")
    private Integer passengerCount = 1;

    @Column(name = "total_distance")
    private BigDecimal totalDistance;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @Column(name = "fuel_type", length = 20)
    private String fuelType;

    @Column(name = "departure_date")
    private LocalDate departureDate;

    @Column(name = "total_duration_minutes")
    private Integer totalDurationMinutes;

    /** "road" or "approximate"; null on records saved before provenance existed (legacy). */
    @Column(name = "distance_quality", length = 16)
    private String distanceQuality;

    @Column(name = "distance_source", length = 32)
    private String distanceSource;

    @Column(name = "calculation_version", length = 32)
    private String calculationVersion;

    @Column(name = "calculated_at")
    private LocalDateTime calculatedAt;

    @OneToMany(mappedBy = "route", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("positionOrder ASC")
    private List<Waypoint> waypoints = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
