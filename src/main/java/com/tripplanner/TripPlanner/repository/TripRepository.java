package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.model.Trip;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<Trip, Long> {
}
