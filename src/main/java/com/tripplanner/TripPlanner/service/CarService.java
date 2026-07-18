package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.CarDTO;
import com.tripplanner.TripPlanner.dto.SaveCarRequest;
import com.tripplanner.TripPlanner.entity.Car;
import com.tripplanner.TripPlanner.repository.CarRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CarService {

    static final int MAX_CARS_PER_USER = 10;
    static final BigDecimal MIN_CONSUMPTION = BigDecimal.valueOf(3.0);
    static final BigDecimal MAX_CONSUMPTION = BigDecimal.valueOf(25.0);
    private static final Set<String> FUEL_TYPES = Set.of("petrol", "diesel", "lpg");
    private static final Set<String> SOURCES = Set.of("catalog", "ai", "preset", "manual");

    private final CarRepository carRepository;

    @Transactional(readOnly = true)
    public List<CarDTO> getUserCars(Long userId) {
        return carRepository.findByUserIdOrderByIsDefaultDescUpdatedAtDesc(userId)
                .stream().map(CarService::toDto).collect(Collectors.toList());
    }

    @Transactional
    public CarDTO createCar(Long userId, SaveCarRequest req) {
        validate(req);
        if (carRepository.countByUserId(userId) >= MAX_CARS_PER_USER) {
            throw new IllegalArgumentException("Car limit reached (" + MAX_CARS_PER_USER + ")");
        }
        boolean firstCar = carRepository.countByUserId(userId) == 0;
        boolean makeDefault = firstCar || Boolean.TRUE.equals(req.getIsDefault());
        if (makeDefault && !firstCar) {
            clearCurrentDefault(userId);
        }
        Car car = new Car();
        car.setUserId(userId);
        applyRequest(car, req);
        car.setIsDefault(makeDefault);
        return toDto(carRepository.save(car));
    }

    @Transactional
    public CarDTO updateCar(Long id, Long userId, SaveCarRequest req) {
        validate(req);
        Car car = carRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NoSuchElementException("Car not found"));
        if (Boolean.TRUE.equals(req.getIsDefault()) && !Boolean.TRUE.equals(car.getIsDefault())) {
            clearCurrentDefault(userId);
            car.setIsDefault(true);
        }
        // isDefault=false on the current default is ignored: a non-empty garage keeps one default
        applyRequest(car, req);
        return toDto(carRepository.save(car));
    }

    @Transactional
    public void deleteCar(Long id, Long userId) {
        Car car = carRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NoSuchElementException("Car not found"));
        boolean wasDefault = Boolean.TRUE.equals(car.getIsDefault());
        carRepository.delete(car);
        if (wasDefault) {
            carRepository.findFirstByUserIdOrderByUpdatedAtDesc(userId).ifPresent(next -> {
                next.setIsDefault(true);
                carRepository.save(next);
            });
        }
    }

    @Transactional
    public CarDTO setDefault(Long id, Long userId) {
        Car car = carRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NoSuchElementException("Car not found"));
        clearCurrentDefault(userId);
        car.setIsDefault(true);
        return toDto(carRepository.save(car));
    }

    private void clearCurrentDefault(Long userId) {
        // Must flush (not just save) here: prod has a NON-DEFERRABLE partial unique index
        // uq_cars_one_default_per_user ON cars(user_id) WHERE is_default, so the old default's
        // is_default=false write has to reach the DB before any new is_default=true write/insert
        // in the same transaction, or the swap trips a DataIntegrityViolationException.
        // (Dev/test schemas don't have this index, so this can only surface in prod.)
        carRepository.findByUserIdAndIsDefaultTrue(userId).ifPresent(current -> {
            current.setIsDefault(false);
            carRepository.saveAndFlush(current);
        });
    }

    private static void applyRequest(Car car, SaveCarRequest req) {
        car.setName(req.getName().trim());
        car.setMakeModel(req.getMakeModel());
        car.setFuelType(req.getFuelType());
        car.setFuelConsumption(req.getFuelConsumption());
        car.setSource(req.getSource());
    }

    private static void validate(SaveCarRequest req) {
        if (req.getName() == null || req.getName().isBlank() || req.getName().length() > 100) {
            throw new IllegalArgumentException("Name must be 1-100 characters");
        }
        if (req.getMakeModel() != null && req.getMakeModel().length() > 150) {
            throw new IllegalArgumentException("Make/model too long");
        }
        if (req.getFuelType() == null || !FUEL_TYPES.contains(req.getFuelType())) {
            throw new IllegalArgumentException("Fuel type must be petrol, diesel or lpg");
        }
        if (req.getSource() == null || !SOURCES.contains(req.getSource())) {
            throw new IllegalArgumentException("Invalid source");
        }
        BigDecimal c = req.getFuelConsumption();
        if (c == null || c.compareTo(MIN_CONSUMPTION) < 0 || c.compareTo(MAX_CONSUMPTION) > 0) {
            throw new IllegalArgumentException("Fuel consumption must be between 3.0 and 25.0 L/100km");
        }
    }

    private static CarDTO toDto(Car car) {
        return CarDTO.builder()
                .id(car.getId())
                .name(car.getName())
                .makeModel(car.getMakeModel())
                .fuelType(car.getFuelType())
                .fuelConsumption(car.getFuelConsumption())
                .isDefault(car.getIsDefault())
                .source(car.getSource())
                .build();
    }
}
