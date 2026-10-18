package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.*;
import com.tripplanner.TripPlanner.dto.*;
import com.tripplanner.TripPlanner.entity.*;
import com.tripplanner.TripPlanner.repository.*;
import com.tripplanner.TripPlanner.routing.RoutingService;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class RouteCostContractTest {
    @Test void sharedFixtureControlsPersistedRouteAndReceiptInputsAndTotals() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        RouteRepository routes = mock(RouteRepository.class);
        when(routes.save(any())).thenAnswer(i -> i.getArgument(0));
        RoutingService routing = mock(RoutingService.class);
        RouteService service = new RouteService(routes, mock(WaypointRepository.class), routing, RouteTestTransactions.manager(), new com.tripplanner.TripPlanner.service.RouteSaveLimiter(4, 1), mock(jakarta.persistence.EntityManagerFactory.class));
        TripReceiptRepository receipts = mock(TripReceiptRepository.class);
        when(receipts.save(any())).thenAnswer(i -> i.getArgument(0));
        ReceiptService receiptService = new ReceiptService(receipts, new SlugGenerator(), mapper, new ReceiptGeometry(mapper));
        JsonNode cases = mapper.readTree(Path.of("fixtures/route-cost-v2.json").toFile()).get("cases");
        assertThat(cases.size()).isEqualTo(8);
        for (JsonNode c : cases) {
            when(routing.calculateRoute(any())).thenReturn(Map.of("quality", "road", "totalDistance", c.get("rawDistanceKm").asDouble()));
            SaveRouteRequest request = request();
            request.setFuelConsumption(new BigDecimal(c.get("fuelConsumption").asText()));
            request.setFuelCostPerLiter(new BigDecimal(c.get("fuelPrice").asText()));
            request.setPassengerCount(c.get("people").asInt());
            RouteDTO saved = service.saveRoute(request, 1L);
            assertThat(saved.getTotalDistance()).isEqualTo(new BigDecimal(c.get("distanceKm").asText()));
            assertThat(saved.getFuelConsumption()).isEqualTo(new BigDecimal(c.get("normalizedFuelConsumption").asText()));
            assertThat(saved.getFuelCostPerLiter()).isEqualTo(new BigDecimal(c.get("normalizedFuelPrice").asText()));
            assertThat(saved.getTotalCost()).isEqualTo(new BigDecimal(c.get("totalCost").asText()));
            assertThat(saved.getCalculationVersion()).isEqualTo("route-save/2");
            CreateReceiptRequest receipt = new CreateReceiptRequest();
            receipt.setDistanceKm(c.get("rawDistanceKm").asDouble());
            receipt.setFuelConsumption(c.get("fuelConsumption").asDouble());
            receipt.setFuelPrice(c.get("fuelPrice").asDouble());
            receipt.setPeople(c.get("people").asInt()); receipt.setCurrency("EUR");
            ReceiptDTO dto = receiptService.create(receipt, 1L);
            assertThat(dto.getDistanceKm()).isEqualTo(new BigDecimal(c.get("distanceKm").asText()));
            assertThat(dto.getFuelConsumption()).isEqualTo(new BigDecimal(c.get("normalizedFuelConsumption").asText()));
            assertThat(dto.getFuelPrice()).isEqualTo(new BigDecimal(c.get("normalizedFuelPrice").asText()));
            assertThat(dto.getTotalCost()).isEqualTo(new BigDecimal(c.get("totalCost").asText()));
            assertThat(dto.getCostPerPerson()).isEqualTo(new BigDecimal(c.get("costPerPerson").asText()));
        }
    }
    @Test void normalizationAcceptsZeroButRejectsNegativeInputsAndInvalidPeople() {
        assertThat(RouteCost.normalize(BigDecimal.ZERO)).isEqualTo(new BigDecimal("0.00"));
        assertThat(RouteCost.total(BigDecimal.ZERO, BigDecimal.ONE, BigDecimal.ONE)).isEqualTo(new BigDecimal("0.00"));
        assertThatThrownBy(() -> RouteCost.normalize(new BigDecimal("-0.001"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RouteCost.total(BigDecimal.ONE, new BigDecimal("-1"), BigDecimal.ONE))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RouteCost.perPerson(BigDecimal.ONE, 0)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void legacyReceiptNumbersAreNotRenormalizedOrRewrittenOnRead() {
        TripReceiptRepository receipts = mock(TripReceiptRepository.class);
        TripReceipt old = new TripReceipt();
        old.setSlug("legacy01"); old.setDistanceKm(new BigDecimal("188.695"));
        old.setFuelConsumption(new BigDecimal("7.555")); old.setFuelPrice(new BigDecimal("1.755"));
        old.setTotalCost(new BigDecimal("25.019")); old.setCostPerPerson(new BigDecimal("8.339"));
        when(receipts.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(old));
        ObjectMapper mapper = new ObjectMapper();
        ReceiptService service = new ReceiptService(receipts, new SlugGenerator(), mapper, new ReceiptGeometry(mapper));
        ReceiptDTO dto = service.listForUser(1L).get(0);
        assertThat(dto.getDistanceKm()).isEqualTo(new BigDecimal("188.695"));
        assertThat(dto.getTotalCost()).isEqualTo(new BigDecimal("25.019"));
        assertThat(dto.getCostPerPerson()).isEqualTo(new BigDecimal("8.339"));
        assertThat(old.getFuelConsumption()).isEqualTo(new BigDecimal("7.555"));
        verify(receipts, never()).save(any());
    }

    static SaveRouteRequest request() {
        SaveRouteRequest r = new SaveRouteRequest(); r.setName("A-B"); r.setCurrency("EUR");
        r.setFuelConsumption(new BigDecimal("10")); r.setFuelCostPerLiter(new BigDecimal("60"));
        WaypointDTO a = new WaypointDTO(); a.setName("A"); a.setLatitude(new BigDecimal("50")); a.setLongitude(new BigDecimal("14"));
        WaypointDTO b = new WaypointDTO(); b.setName("B"); b.setLatitude(new BigDecimal("51")); b.setLongitude(new BigDecimal("15"));
        r.setWaypoints(List.of(a,b)); return r;
    }
}
