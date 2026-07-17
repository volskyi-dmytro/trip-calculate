package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.dto.CarDTO;
import com.tripplanner.TripPlanner.dto.SaveCarRequest;
import com.tripplanner.TripPlanner.entity.Car;
import com.tripplanner.TripPlanner.repository.CarRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CarServiceTest {
    private final CarRepository carRepository = mock(CarRepository.class);
    private final CarService service = new CarService(carRepository);

    private static SaveCarRequest validRequest() {
        return new SaveCarRequest("My Octavia", "Škoda Octavia A5 1.9 TDI",
                "diesel", BigDecimal.valueOf(6.5), false, "manual");
    }

    private static Car car(Long id, Long userId, boolean isDefault) {
        Car c = new Car();
        c.setId(id);
        c.setUserId(userId);
        c.setName("Car " + id);
        c.setFuelType("petrol");
        c.setFuelConsumption(BigDecimal.valueOf(8.0));
        c.setIsDefault(isDefault);
        c.setSource("manual");
        return c;
    }

    @Test
    void firstCarBecomesDefaultEvenWhenNotRequested() {
        when(carRepository.countByUserId(1L)).thenReturn(0L);
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));

        CarDTO result = service.createCar(1L, validRequest());

        assertTrue(result.getIsDefault());
    }

    @Test
    void creatingDefaultClearsPreviousDefault() {
        SaveCarRequest request = validRequest();
        request.setIsDefault(true);
        Car oldDefault = car(5L, 1L, true);
        when(carRepository.countByUserId(1L)).thenReturn(3L);
        when(carRepository.findByUserIdAndIsDefaultTrue(1L)).thenReturn(Optional.of(oldDefault));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));

        service.createCar(1L, request);

        assertFalse(oldDefault.getIsDefault());
        verify(carRepository).save(oldDefault);
    }

    @Test
    void rejectsEleventhCar() {
        when(carRepository.countByUserId(1L)).thenReturn(10L);
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, validRequest()));
    }

    @Test
    void rejectsConsumptionOutOfBounds() {
        when(carRepository.countByUserId(1L)).thenReturn(0L);
        SaveCarRequest low = validRequest();
        low.setFuelConsumption(BigDecimal.valueOf(2.9));
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, low));
        SaveCarRequest high = validRequest();
        high.setFuelConsumption(BigDecimal.valueOf(25.1));
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, high));
    }

    @Test
    void rejectsUnknownFuelType() {
        SaveCarRequest request = validRequest();
        request.setFuelType("kerosene");
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, request));
    }

    @Test
    void rejectsUnknownSource() {
        SaveCarRequest request = validRequest();
        request.setSource("guess");
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, request));
    }

    @Test
    void rejectsBlankName() {
        SaveCarRequest request = validRequest();
        request.setName("  ");
        assertThrows(IllegalArgumentException.class, () -> service.createCar(1L, request));
    }

    @Test
    void updateIsOwnerScoped() {
        when(carRepository.findByIdAndUserId(7L, 1L)).thenReturn(Optional.empty());
        assertThrows(NoSuchElementException.class, () -> service.updateCar(7L, 1L, validRequest()));
    }

    @Test
    void unsettingDefaultOnCurrentDefaultIsIgnored() {
        Car current = car(7L, 1L, true);
        SaveCarRequest request = validRequest(); // isDefault=false
        when(carRepository.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(current));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));

        CarDTO result = service.updateCar(7L, 1L, request);

        assertTrue(result.getIsDefault());
    }

    @Test
    void deletingDefaultPromotesMostRecentlyUpdated() {
        Car deleted = car(7L, 1L, true);
        Car survivor = car(8L, 1L, false);
        when(carRepository.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(deleted));
        when(carRepository.findFirstByUserIdOrderByUpdatedAtDesc(1L)).thenReturn(Optional.of(survivor));

        service.deleteCar(7L, 1L);

        assertTrue(survivor.getIsDefault());
        verify(carRepository).delete(deleted);
        verify(carRepository).save(survivor);
    }

    @Test
    void deletingNonDefaultPromotesNothing() {
        Car deleted = car(7L, 1L, false);
        when(carRepository.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(deleted));

        service.deleteCar(7L, 1L);

        verify(carRepository, never()).findFirstByUserIdOrderByUpdatedAtDesc(any());
    }

    @Test
    void setDefaultSwapsInOneCall() {
        Car oldDefault = car(5L, 1L, true);
        Car target = car(7L, 1L, false);
        when(carRepository.findByIdAndUserId(7L, 1L)).thenReturn(Optional.of(target));
        when(carRepository.findByUserIdAndIsDefaultTrue(1L)).thenReturn(Optional.of(oldDefault));
        when(carRepository.save(any(Car.class))).thenAnswer(inv -> inv.getArgument(0));

        CarDTO result = service.setDefault(7L, 1L);

        assertFalse(oldDefault.getIsDefault());
        assertTrue(result.getIsDefault());
    }
}
