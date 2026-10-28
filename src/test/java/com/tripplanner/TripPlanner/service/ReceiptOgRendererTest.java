package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import org.junit.jupiter.api.Test;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.Arrays;
import static org.junit.jupiter.api.Assertions.*;

class ReceiptOgRendererTest {
    @Test
    void rendersCyrillicHostileLabelsLargeAmountsAndMissingLabelsWithinBudget() throws Exception {
        var renderer = new ReceiptOgRenderer();
        String[][] labels = {
                {"Kyiv", "Lviv", "en"},
                {"Івано-Франківськ", "Кам'янець-Подільський", "uk"},
                {"🚗 " + "A long origin by the railway station ".repeat(8), "<script>alert(1)</script> & " + "Long destination ".repeat(12), "en"},
                {"Odesa", "Mykolaiv", "en"},
                {null, null, "en"}
        };
        byte[] previous = null;
        for (int i = 0; i < labels.length; i++) {
            var r = new TripReceipt();
            r.setOriginLabel(labels[i][0]); r.setDestinationLabel(labels[i][1]); r.setLocale(labels[i][2]);
            r.setDistanceKm(new BigDecimal("540")); r.setCurrency(i == 3 ? "UAH" : "EUR");
            r.setPeople(i == 3 ? 1 : 4); r.setCostPerPerson(new BigDecimal(i == 3 ? "12345.67" : "24.50"));
            r.setTotalCost(new BigDecimal(i == 3 ? "12345.67" : "98.00"));
            byte[] png = renderer.render(r);
            var image = ImageIO.read(new ByteArrayInputStream(png));
            assertNotNull(image);
            assertEquals(1200, image.getWidth()); assertEquals(630, image.getHeight());
            assertTrue(png.length < 300_000, "PNG exceeds crawler image budget");
            if (previous != null) assertFalse(Arrays.equals(previous, png), "Different receipts must produce different images");
            previous = png;
            String output = System.getProperty("receipt.og.samples");
            if (output != null) {
                Path directory = Path.of(output);
                Files.createDirectories(directory);
                Files.write(directory.resolve("receipt-" + i + ".png"), png);
            }
        }
    }
}
