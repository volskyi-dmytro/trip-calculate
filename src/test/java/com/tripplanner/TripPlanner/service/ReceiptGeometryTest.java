package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReceiptGeometryTest {

    private final ObjectMapper json = new ObjectMapper();
    private final ReceiptGeometry geometry = new ReceiptGeometry(json);

    private double[][] parse(String value) throws Exception {
        return json.readValue(value, double[][].class);
    }

    // Haversine, metres
    private static double distance(double[] a, double[] b) {
        double r = 6_371_000, dLat = Math.toRadians(b[0] - a[0]), dLng = Math.toRadians(b[1] - a[1]);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(a[0])) * Math.cos(Math.toRadians(b[0])) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * r * Math.asin(Math.sqrt(h));
    }

    @Test
    void theDrawnRouteNoLongerStartsOrEndsAtTheExactAddresses() throws Exception {
        double[] home = {50.450123, 30.523456};
        double[] office = {49.839683, 24.029717};
        String coarse = geometry.coarsen("[[50.450123,30.523456],[50.1,27.5],[49.839683,24.029717]]");

        double[][] points = parse(coarse);
        assertTrue(distance(points[0], home) > 250, "start still within 250 m of home");
        assertTrue(distance(points[points.length - 1], office) > 250, "end still within 250 m of the destination");
    }

    @Test
    void coordinatesAreRoundedToAboutOneHundredMetres() throws Exception {
        for (double[] p : parse(geometry.coarsen("[[50.450123,30.523456],[49.839683,24.029717]]"))) {
            assertEquals(p[0], Math.round(p[0] * 1000) / 1000.0);
            assertEquals(p[1], Math.round(p[1] * 1000) / 1000.0);
        }
    }

    @Test
    void veryShortRoutesAreNotDrawnAtAll() {
        // Under 1 km there is nothing left to draw that wouldn't reveal both ends.
        assertNull(geometry.coarsen("[[50.450123,30.523456],[50.452,30.525]]"));
    }

    @Test
    void alreadyCoarseGeometryIsReturnedUnchanged() {
        String once = geometry.coarsen("[[50.450123,30.523456],[50.1,27.5],[49.839683,24.029717]]");
        assertEquals(once, geometry.coarsenIfPrecise(once));
    }

    @Test
    void preciseStoredGeometryIsCoarsenedOnTheWayOut() throws Exception {
        String stored = "[[50.450123,30.523456],[50.1,27.5],[49.839683,24.029717]]";
        assertEquals(geometry.coarsen(stored), geometry.coarsenIfPrecise(stored));
        assertNull(geometry.coarsenIfPrecise(null));
    }
}
