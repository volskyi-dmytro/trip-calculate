package com.tripplanner.TripPlanner.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class CarModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private Double defaultFuelConsumption;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Double getDefaultFuelConsumption() {
        return defaultFuelConsumption;
    }

    public void setDefaultFuelConsumption(Double defaultFuelConsumption) {
        this.defaultFuelConsumption = defaultFuelConsumption;
    }
}
