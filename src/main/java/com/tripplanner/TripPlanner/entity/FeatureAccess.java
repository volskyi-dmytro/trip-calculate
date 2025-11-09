package com.tripplanner.TripPlanner.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "feature_access")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FeatureAccess {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "route_planner_enabled")
    private Boolean routePlannerEnabled = false;

    @Column(name = "granted_at")
    private LocalDateTime grantedAt;

    @Column(name = "granted_by")
    private String grantedBy;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
