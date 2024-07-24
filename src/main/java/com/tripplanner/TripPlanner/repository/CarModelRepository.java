package com.tripplanner.TripPlanner.repository;

import com.tripplanner.TripPlanner.model.CarModel;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CarModelRepository extends JpaRepository<CarModel, Long> {
}
