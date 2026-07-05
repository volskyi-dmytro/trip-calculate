package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface TripReceiptRepository extends JpaRepository<TripReceipt, Long> {

    Optional<TripReceipt> findBySlug(String slug);

    boolean existsBySlug(String slug);

    List<TripReceipt> findByUserIdOrderByCreatedAtDesc(Long userId);

    // Atomic counter updates: receipts are hit by anonymous traffic, so
    // read-modify-write on the entity would lose increments under load.
    @Modifying
    @Query("UPDATE TripReceipt r SET r.viewCount = r.viewCount + 1 WHERE r.slug = :slug")
    int incrementViewCount(@Param("slug") String slug);

    @Modifying
    @Query("UPDATE TripReceipt r SET r.ctaClickCount = r.ctaClickCount + 1 WHERE r.slug = :slug")
    int incrementCtaClickCount(@Param("slug") String slug);

    @Modifying
    @Query("DELETE FROM TripReceipt r WHERE r.expiresAt IS NOT NULL AND r.expiresAt < :now")
    int deleteExpired(@Param("now") LocalDateTime now);
}
