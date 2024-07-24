package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.model.Trip;
import com.tripplanner.TripPlanner.repository.TripRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TripService {
    @Autowired
    private TripRepository tripRepository;

    public Trip saveTrip(Trip trip) {
        return tripRepository.save(trip);
    }

    public List<Trip> getAllTrips() {
        return tripRepository.findAll();
    }
}
