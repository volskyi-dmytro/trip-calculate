package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.model.CarModel;
import com.tripplanner.TripPlanner.model.Trip;
import com.tripplanner.TripPlanner.repository.CarModelRepository;
import com.tripplanner.TripPlanner.service.TripService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
public class TripController {

    @Autowired
    private TripService tripService;
    @Autowired
    private CarModelRepository carModelRepository;

    @GetMapping("/")
    public String showLandingPage(Model model) {
        return "index"; // Serve the static landing page
    }

    @PostMapping("/calculate")
    @ResponseBody
    public Trip calculateTrip(@RequestBody Trip trip) {
        if (trip.getCustomFuelConsumption() == null && (trip.getCarModel() == null || trip.getCarModel().getId() == null)) {
            throw new IllegalArgumentException("You must enter a custom fuel consumption value or select a car model.");
        }

        if (trip.getCarModel() != null && trip.getCarModel().getId() != null) {
            CarModel carModel = carModelRepository.findById(trip.getCarModel().getId()).orElse(null);
            if (carModel == null) {
                throw new IllegalArgumentException("Invalid car model selected.");
            }
            trip.setCarModel(carModel);
        } else {
            trip.setCarModel(null); // Explicitly set carModel to null if not provided
        }

        tripService.saveTrip(trip);
        return trip; // Return the calculated trip details
    }
}
