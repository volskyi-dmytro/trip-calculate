package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.regex.Pattern;

/**
 * Makes a shared receipt's route line unable to pinpoint where the trip starts
 * or ends (often someone's home).
 *
 * <ul>
 *   <li>Each end is cut by a random 500-1500 m, so the cut can't be undone by
 *       subtracting a known distance.</li>
 *   <li>Only real route vertices beyond the cut are kept. Interpolating along a
 *       long straight chord would point straight back at the start.</li>
 *   <li>Coordinates are rounded to 3 decimals (~100 m).</li>
 * </ul>
 * Routes too short to keep at least two points are not drawn at all.
 *
 * <p>Geometry is a JSON array of {@code [lat, lng]} pairs.
 */
@Component
public class ReceiptGeometry {

    private static final double MIN_TRIM_METERS = 500;
    private static final double MAX_TRIM_METERS = 1_500;
    private static final double EARTH_RADIUS_METERS = 6_371_000;
    // A coordinate with 4+ decimals was never coarsened (stored before this existed).
    private static final Pattern PRECISE_NUMBER = Pattern.compile("\\d\\.\\d{4,}");

    private final ObjectMapper objectMapper;

    public ReceiptGeometry(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** @return the coarse geometry, or null when nothing safe is left to draw */
    public String coarsen(String geometry) {
        return coarsen(geometry, new SecureRandom());
    }

    String coarsen(String geometry, Random random) {
        try {
            double[][] points = objectMapper.readValue(geometry, double[][].class);
            List<double[]> trimmed = trim(points, trimLength(random), trimLength(random));
            if (trimmed == null) {
                return null;
            }
            List<double[]> rounded = new ArrayList<>();
            for (double[] p : trimmed) {
                double[] r = {round3(p[0]), round3(p[1])};
                if (rounded.isEmpty() || !samePoint(rounded.get(rounded.size() - 1), r)) {
                    rounded.add(r);
                }
            }
            return rounded.size() < 2 ? null : objectMapper.writeValueAsString(rounded);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * For reads: geometry stored before coarsening existed is coarsened, the rest
     * is left alone. The random trim is seeded by the stored (never exposed)
     * geometry, so every read shows the same line and reads can't be averaged.
     */
    public String coarsenIfPrecise(String geometry, long salt) {
        if (geometry == null) {
            return null;
        }
        if (!PRECISE_NUMBER.matcher(geometry).find()) {
            return geometry;
        }
        return coarsen(geometry, new Random(salt * 31 + geometry.hashCode()));
    }

    private static double trimLength(Random random) {
        return MIN_TRIM_METERS + random.nextDouble() * (MAX_TRIM_METERS - MIN_TRIM_METERS);
    }

    // Keeps the original vertices lying beyond the trim distance from each end.
    private static List<double[]> trim(double[][] points, double startTrim, double endTrim) {
        if (points.length < 2) {
            return null;
        }
        double[] cumulative = new double[points.length];
        for (int i = 1; i < points.length; i++) {
            cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i]);
        }
        double to = cumulative[points.length - 1] - endTrim;
        List<double[]> result = new ArrayList<>();
        for (int i = 0; i < points.length; i++) {
            if (cumulative[i] > startTrim && cumulative[i] < to) {
                result.add(points[i]);
            }
        }
        return result;
    }

    private static double distance(double[] a, double[] b) {
        double dLat = Math.toRadians(b[0] - a[0]);
        double dLng = Math.toRadians(b[1] - a[1]);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(a[0])) * Math.cos(Math.toRadians(b[0])) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
    }

    private static double round3(double value) {
        return Math.round(value * 1000) / 1000.0;
    }

    private static boolean samePoint(double[] a, double[] b) {
        return a[0] == b[0] && a[1] == b[1];
    }
}
