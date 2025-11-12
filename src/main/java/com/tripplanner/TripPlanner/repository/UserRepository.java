package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByGoogleId(String googleId);

    Optional<User> findByEmail(String email);

    boolean existsByGoogleId(String googleId);

    boolean existsByEmail(String email);

    // Dashboard statistics queries
    long countByCreatedAtAfter(LocalDateTime dateTime);

    long countByLastLoginAfter(LocalDateTime dateTime);

    @Query("SELECT u FROM User u ORDER BY u.createdAt DESC")
    List<User> findAllOrderByCreatedAtDesc();
}
