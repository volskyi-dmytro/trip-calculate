package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Random;

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

    // A route like the frontend sends it: many vertices along the way.
    private static String path(double[] from, double[] to, int vertices) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < vertices; i++) {
            double f = i / (double) (vertices - 1);
            if (i > 0) sb.append(',');
            sb.append('[').append(from[0] + f * (to[0] - from[0])).append(',').append(from[1] + f * (to[1] - from[1])).append(']');
        }
        return sb.append(']').toString();
    }

    private static final double[] HOME = {50.450123, 30.523456};
    private static final double[] OFFICE = {49.839683, 24.029717};
    private static final String KYIV_LVIV = path(HOME, OFFICE, 2000);

    @Test
    void theDrawnRouteNoLongerStartsOrEndsAtTheExactAddresses() throws Exception {
        double[][] points = parse(geometry.coarsen(KYIV_LVIV, new Random(1)));

        assertTrue(distance(points[0], HOME) > 450, "start still within 450 m of home");
        assertTrue(distance(points[points.length - 1], OFFICE) > 450, "end still within 450 m of the destination");
    }

    @Test
    void theTrimLengthIsRandomSoTheEndpointCannotBeWorkedBackOut() throws Exception {
        // A fixed trim is public in the code: first point minus that distance = home.
        double a = distance(parse(geometry.coarsen(KYIV_LVIV, new Random(1)))[0], HOME);
        double b = distance(parse(geometry.coarsen(KYIV_LVIV, new Random(987654321L)))[0], HOME);
        assertTrue(Math.abs(a - b) > 50, "trim did not vary: " + a + " vs " + b);
        for (long seed = 0; seed < 50; seed++) {
            double d = distance(parse(geometry.coarsen(KYIV_LVIV, new Random(seed)))[0], HOME);
            assertTrue(d > 450 && d < 1700, "trim out of range: " + d);
        }
    }

    @Test
    void keptPointsAreRealRouteVerticesNotInterpolatedOnes() throws Exception {
        // Interpolating along a long straight chord would point straight back at home.
        String twoLongChords = "[[50.450123,30.523456],[50.1,27.5],[49.839683,24.029717]]";
        // Only the middle vertex survives the trim, and one point is not a line.
        assertNull(geometry.coarsen(twoLongChords, new Random(1)));
    }

    @Test
    void coordinatesAreRoundedToAboutOneHundredMetres() throws Exception {
        for (double[] p : parse(geometry.coarsen(KYIV_LVIV, new Random(3)))) {
            assertEquals(p[0], Math.round(p[0] * 1000) / 1000.0);
            assertEquals(p[1], Math.round(p[1] * 1000) / 1000.0);
        }
    }

    @Test
    void veryShortRoutesAreNotDrawnAtAll() {
        // Under 1 km there is nothing left to draw that wouldn't reveal both ends.
        assertNull(geometry.coarsen(path(HOME, new double[]{50.452, 30.525}, 20), new Random(1)));
    }

    @Test
    void alreadyCoarseGeometryIsReturnedUnchanged() {
        String once = geometry.coarsen(KYIV_LVIV, new Random(1));
        assertEquals(once, geometry.coarsenIfPrecise(once, 42L));
    }

    @Test
    void preciseStoredGeometryIsCoarsenedOnTheWayOut() throws Exception {
        // Seeded per receipt, so repeated reads can't be averaged to find the ends.
        assertEquals(geometry.coarsenIfPrecise(KYIV_LVIV, 42L), geometry.coarsenIfPrecise(KYIV_LVIV, 42L));
        assertTrue(geometry.coarsenIfPrecise(KYIV_LVIV, 42L).length() < KYIV_LVIV.length());
        assertNull(geometry.coarsenIfPrecise(null, 42L));
    }
}
