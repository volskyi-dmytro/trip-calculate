package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Makes a shared receipt's route line unable to pinpoint where the trip starts
 * or ends (often someone's home): the line is cut {@value #TRIM_METERS} m from
 * each end and every coordinate is rounded to 3 decimals (~100 m). Routes too
 * short to survive the trim are not drawn at all.
 *
 * <p>Geometry is a JSON array of {@code [lat, lng]} pairs.
 */
@Component
public class ReceiptGeometry {

    static final double TRIM_METERS = 300;
    private static final double MIN_ROUTE_METERS = 1_000;
    private static final double EARTH_RADIUS_METERS = 6_371_000;
    // A coordinate with 4+ decimals was never coarsened (stored before this existed).
    private static final Pattern PRECISE_NUMBER = Pattern.compile("\\d\\.\\d{4,}");

    private final ObjectMapper objectMapper;

    public ReceiptGeometry(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** @return the coarse geometry, or null when nothing safe is left to draw */
    public String coarsen(String geometry) {
        try {
            double[][] points = objectMapper.readValue(geometry, double[][].class);
            List<double[]> trimmed = trim(points);
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

    /** For reads: geometry stored before coarsening existed is coarsened, the rest is left alone. */
    public String coarsenIfPrecise(String geometry) {
        if (geometry == null) {
            return null;
        }
        return PRECISE_NUMBER.matcher(geometry).find() ? coarsen(geometry) : geometry;
    }

    // Keeps the part of the line between TRIM_METERS from the start and TRIM_METERS from the end.
    private static List<double[]> trim(double[][] points) {
        if (points.length < 2) {
            return null;
        }
        double[] cumulative = new double[points.length];
        for (int i = 1; i < points.length; i++) {
            cumulative[i] = cumulative[i - 1] + distance(points[i - 1], points[i]);
        }
        double total = cumulative[points.length - 1];
        if (total < MIN_ROUTE_METERS) {
            return null;
        }
        double from = TRIM_METERS;
        double to = total - TRIM_METERS;

        List<double[]> result = new ArrayList<>();
        result.add(pointAt(points, cumulative, from));
        for (int i = 0; i < points.length; i++) {
            if (cumulative[i] > from && cumulative[i] < to) {
                result.add(points[i]);
            }
        }
        result.add(pointAt(points, cumulative, to));
        return result;
    }

    // The point at a given distance along the line, interpolated within its segment.
    private static double[] pointAt(double[][] points, double[] cumulative, double along) {
        for (int i = 1; i < points.length; i++) {
            if (cumulative[i] >= along) {
                double segment = cumulative[i] - cumulative[i - 1];
                double f = segment == 0 ? 0 : (along - cumulative[i - 1]) / segment;
                return new double[]{
                        points[i - 1][0] + f * (points[i][0] - points[i - 1][0]),
                        points[i - 1][1] + f * (points[i][1] - points[i - 1][1])};
            }
        }
        return points[points.length - 1];
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
