package com.tripplanner.TripPlanner.model;

import jakarta.persistence.*;

@Entity
public class Trip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    private CarModel carModel;

    private Double customFuelConsumption;
    private int numberOfPassengers;
    private double distance;
    private double fuelCost;
    private double totalFuelCost;
    private double costPerPassenger;

    @PrePersist
    @PreUpdate
    private void calculateCosts() {
        Double fuelConsumption = customFuelConsumption != null ? customFuelConsumption : 0.0;
        if (carModel != null && carModel.getDefaultFuelConsumption() != null) {
            fuelConsumption = carModel.getDefaultFuelConsumption();
        } else if (customFuelConsumption != null) {
            fuelConsumption = customFuelConsumption;
        }

        this.totalFuelCost = (distance / 100) * fuelConsumption * fuelCost;
        this.costPerPassenger = numberOfPassengers > 0 ? totalFuelCost / numberOfPassengers : totalFuelCost;
    }

    // Getters and setters

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public CarModel getCarModel() {
        return carModel;
    }

    public void setCarModel(CarModel carModel) {
        this.carModel = carModel;
    }

    public Double getCustomFuelConsumption() {
        return customFuelConsumption;
    }

    public void setCustomFuelConsumption(Double customFuelConsumption) {
        this.customFuelConsumption = customFuelConsumption;
    }

    public int getNumberOfPassengers() {
        return numberOfPassengers;
    }

    public void setNumberOfPassengers(int numberOfPassengers) {
        this.numberOfPassengers = numberOfPassengers;
    }

    public double getDistance() {
        return distance;
    }

    public void setDistance(double distance) {
        this.distance = distance;
    }

    public double getFuelCost() {
        return fuelCost;
    }

    public void setFuelCost(double fuelCost) {
        this.fuelCost = fuelCost;
    }

    public double getTotalFuelCost() {
        return totalFuelCost;
    }

    public void setTotalFuelCost(double totalFuelCost) {
        this.totalFuelCost = totalFuelCost;
    }

    public double getCostPerPassenger() {
        return costPerPassenger;
    }

    public void setCostPerPassenger(double costPerPassenger) {
        this.costPerPassenger = costPerPassenger;
    }
}
