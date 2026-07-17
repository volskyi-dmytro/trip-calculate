package com.tripplanner.TripPlanner.controller;

import com.tripplanner.TripPlanner.dto.CarDTO;
import com.tripplanner.TripPlanner.dto.SaveCarRequest;
import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.service.CarService;
import com.tripplanner.TripPlanner.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class CarControllerTest {

    private CarService carService;
    private UserService userService;
    private CarController controller;
    private OAuth2User principal;

    private static final Long USER_ID = 42L;

    @BeforeEach
    void setUp() {
        carService = mock(CarService.class);
        userService = mock(UserService.class);
        controller = new CarController(carService, userService);

        principal = mock(OAuth2User.class);
        doReturn("g-123").when(principal).getAttribute("sub");

        User user = new User();
        user.setId(USER_ID);
        when(userService.findByGoogleId("g-123")).thenReturn(Optional.of(user));
    }

    private SaveCarRequest validRequest() {
        SaveCarRequest req = new SaveCarRequest();
        req.setName("My Car");
        req.setMakeModel("Toyota Corolla");
        req.setFuelType("petrol");
        req.setFuelConsumption(BigDecimal.valueOf(6.5));
        req.setSource("manual");
        return req;
    }

    @Test
    void listReturnsServiceResult() {
        CarDTO dto = CarDTO.builder().id(1L).name("My Car").build();
        when(carService.getUserCars(USER_ID)).thenReturn(List.of(dto));

        ResponseEntity<List<CarDTO>> response = controller.getUserCars(principal);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(List.of(dto), response.getBody());
    }

    @Test
    void createReturns200WithBody() {
        SaveCarRequest request = validRequest();
        CarDTO dto = CarDTO.builder().id(1L).name("My Car").build();
        when(carService.createCar(eq(USER_ID), any(SaveCarRequest.class))).thenReturn(dto);

        ResponseEntity<?> response = controller.createCar(request, principal);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(dto, response.getBody());
    }

    @Test
    void createIllegalArgumentReturns400WithErrorBody() {
        SaveCarRequest request = validRequest();
        when(carService.createCar(eq(USER_ID), any(SaveCarRequest.class)))
                .thenThrow(new IllegalArgumentException("Name must be 1-100 characters"));

        ResponseEntity<?> response = controller.createCar(request, principal);

        assertEquals(400, response.getStatusCode().value());
        assertEquals(Map.of("error", "Name must be 1-100 characters"), response.getBody());
    }

    @Test
    void updateIllegalArgumentReturns400WithErrorBody() {
        SaveCarRequest request = validRequest();
        when(carService.updateCar(eq(1L), eq(USER_ID), any(SaveCarRequest.class)))
                .thenThrow(new IllegalArgumentException("Invalid source"));

        ResponseEntity<?> response = controller.updateCar(1L, request, principal);

        assertEquals(400, response.getStatusCode().value());
        assertEquals(Map.of("error", "Invalid source"), response.getBody());
    }

    @Test
    void updateNotFoundReturns404() {
        SaveCarRequest request = validRequest();
        when(carService.updateCar(eq(1L), eq(USER_ID), any(SaveCarRequest.class)))
                .thenThrow(new NoSuchElementException("Car not found"));

        ResponseEntity<?> response = controller.updateCar(1L, request, principal);

        assertEquals(404, response.getStatusCode().value());
    }

    @Test
    void deleteReturns204() {
        ResponseEntity<?> response = controller.deleteCar(1L, principal);

        assertEquals(204, response.getStatusCode().value());
        verify(carService).deleteCar(1L, USER_ID);
    }

    @Test
    void deleteNotFoundReturns404() {
        doThrow(new NoSuchElementException("Car not found"))
                .when(carService).deleteCar(1L, USER_ID);

        ResponseEntity<?> response = controller.deleteCar(1L, principal);

        assertEquals(404, response.getStatusCode().value());
    }

    @Test
    void setDefaultNotFoundReturns404() {
        when(carService.setDefault(1L, USER_ID)).thenThrow(new NoSuchElementException("Car not found"));

        ResponseEntity<?> response = controller.setDefault(1L, principal);

        assertEquals(404, response.getStatusCode().value());
    }

    @Test
    void setDefaultReturns200WithBody() {
        CarDTO dto = CarDTO.builder().id(1L).name("My Car").isDefault(true).build();
        when(carService.setDefault(1L, USER_ID)).thenReturn(dto);

        ResponseEntity<?> response = controller.setDefault(1L, principal);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(dto, response.getBody());
    }
}
