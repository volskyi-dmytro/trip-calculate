package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.TripReceipt;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.RoundingMode;

/** Receipt cards use bundled assets only; rendering never fetches user-supplied resources. */
@Component
public class ReceiptOgRenderer {
    private final Font font;
    private final BufferedImage background;

    public ReceiptOgRenderer() {
        try (var ttf = getClass().getResourceAsStream("/receipt-og/Manrope.ttf");
             var png = getClass().getResourceAsStream("/receipt-og/glass.png")) {
            font = Font.createFont(Font.TRUETYPE_FONT, ttf);
            if (font.canDisplayUpTo("ІїЄєҐґКам'янець-Подільський→…•") != -1) {
                throw new IllegalStateException("Bundled OG font lacks Ukrainian glyphs");
            }
            background = ImageIO.read(png);
            if (background == null || background.getWidth() != 1200 || background.getHeight() != 630) {
                throw new IllegalStateException("Receipt OG background must be 1200x630");
            }
        } catch (IOException | FontFormatException e) {
            throw new IllegalStateException("Receipt OG assets cannot be loaded", e);
        }
    }

    public byte[] render(TripReceipt r) throws IOException {
        var canvas = new BufferedImage(1200, 630, BufferedImage.TYPE_INT_RGB);
        var g = canvas.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.drawImage(background, 0, 0, null);
            boolean uk = "uk".equals(r.getLocale());
            text(g, "TRIP CALCULATE", 132, 99, 25, true, "#0e7a63");
            text(g, uk ? "ВИТРАТИ НА ПОЇЗДКУ" : "YOUR TRIP, SHARED", 80, 154, 18, true, "#51606d");
            String origin = label(r.getOriginLabel(), uk ? "Ваша поїздка" : "Your road trip");
            String destination = label(r.getDestinationLabel(), uk ? "Розділіть витрати на пальне" : "Split the fuel cost");
            fit(g, origin, 80, 218, 46, 1020);
            fit(g, (r.getDestinationLabel() == null || r.getDestinationLabel().isBlank() ? "" : "→ ") + destination, 80, 280, 46, 1020);
            text(g, uk ? "НА ОДНУ ОСОБУ" : "PER PERSON", 104, 359, 18, true, "#51606d");
            String amount = r.getCostPerPerson().setScale(2, RoundingMode.HALF_UP).toPlainString() + " " + r.getCurrency();
            fit(g, amount, 104, 438, 65, 635);
            text(g, r.getDistanceKm().setScale(0, RoundingMode.HALF_UP) + (uk ? " км" : " km"), 812, 377, 32, true, "#0e7a63");
            text(g, uk ? "Учасників: " + r.getPeople() : r.getPeople() + (r.getPeople() == 1 ? " person" : " people"), 812, 417, 23, false, "#51606d");
            text(g, (uk ? "Разом: " : "Total: ") + r.getTotalCost().setScale(2, RoundingMode.HALF_UP) + " " + r.getCurrency(), 104, 474, 20, false, "#51606d");
            text(g, uk ? "Розрахуйте свою поїздку" : "Calculate your own trip", 80, 546, 23, true, "#0e7a63");
            text(g, "trip-calculate.online", 813, 546, 20, false, "#51606d");
        } finally { g.dispose(); }
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(canvas, "png", bytes);
        return bytes.toByteArray();
    }

    private String label(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        // Bound legacy values too; use a visible bullet for unsupported emoji instead of tofu boxes.
        return value.codePoints().limit(120).filter(cp -> !Character.isISOControl(cp))
                .map(cp -> font.canDisplay(cp) ? cp : 0x2022)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
    }

    private void fit(Graphics2D g, String value, int x, int y, int size, int width) {
        g.setFont(font.deriveFont(Font.BOLD, (float) size));
        while (size > 30 && g.getFontMetrics().stringWidth(value) > width) {
            g.setFont(font.deriveFont(Font.BOLD, (float) --size));
        }
        boolean shortened = false;
        while (g.getFontMetrics().stringWidth(value + (shortened ? "…" : "")) > width && !value.isEmpty()) {
            value = value.substring(0, value.offsetByCodePoints(value.length(), -1));
            shortened = true;
        }
        g.setColor(Color.decode("#1a242e"));
        g.drawString(value + (shortened ? "…" : ""), x, y);
    }

    private void text(Graphics2D g, String value, int x, int y, int size, boolean bold, String color) {
        g.setFont(font.deriveFont(bold ? Font.BOLD : Font.PLAIN, (float) size));
        g.setColor(Color.decode(color));
        g.drawString(value, x, y);
    }
}
