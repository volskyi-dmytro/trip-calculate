package com.tripplanner.TripPlanner.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tripplanner.TripPlanner.dto.CreateReceiptRequest;
import com.tripplanner.TripPlanner.dto.ReceiptDTO;
import com.tripplanner.TripPlanner.entity.TripReceipt;
import com.tripplanner.TripPlanner.repository.TripReceiptRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ReceiptService {

    private static final Logger logger = LoggerFactory.getLogger(ReceiptService.class);

    private static final Set<String> ALLOWED_CURRENCIES = Set.of("UAH", "USD", "EUR", "PLN");
    private static final int MAX_LABEL_LENGTH = 120;
    private static final int MAX_GEOMETRY_CHARS = 60_000;
    private static final int MAX_GEOMETRY_POINTS = 500;
    private static final int ANONYMOUS_EXPIRY_DAYS = 30;
    private static final int SLUG_RETRIES = 5;

    private final TripReceiptRepository repository;
    private final SlugGenerator slugGenerator;
    private final ObjectMapper objectMapper;

    @Transactional
    public ReceiptDTO create(CreateReceiptRequest req, Long userIdOrNull) {
        validateRange(req.getDistanceKm(), 0.1, 50_000, "distanceKm");
        validateRange(req.getFuelConsumption(), 1, 50, "fuelConsumption");
        validateRange(req.getFuelPrice(), 0.01, 1_000, "fuelPrice");
        if (req.getPeople() == null || req.getPeople() < 1 || req.getPeople() > 100) {
            throw badRequest("people must be between 1 and 100");
        }
        if (req.getCurrency() == null || !ALLOWED_CURRENCIES.contains(req.getCurrency())) {
            throw badRequest("unsupported currency");
        }

        TripReceipt receipt = new TripReceipt();
        receipt.setSlug(uniqueSlug());
        receipt.setOriginLabel(sanitizeLabel(req.getOriginLabel()));
        receipt.setDestinationLabel(sanitizeLabel(req.getDestinationLabel()));
        receipt.setDistanceKm(BigDecimal.valueOf(req.getDistanceKm()));
        receipt.setFuelConsumption(BigDecimal.valueOf(req.getFuelConsumption()));
        receipt.setFuelPrice(BigDecimal.valueOf(req.getFuelPrice()));
        receipt.setCurrency(req.getCurrency());
        receipt.setPeople(req.getPeople());
        receipt.setLocale("uk".equalsIgnoreCase(req.getLocale()) ? "uk" : "en");
        receipt.setRouteGeometry(validGeometryOrNull(req.getRouteGeometry()));
        receipt.setUserId(userIdOrNull);
        receipt.setExpiresAt(userIdOrNull == null
                ? LocalDateTime.now().plusDays(ANONYMOUS_EXPIRY_DAYS)
                : null);
        receipt.setViewCount(0L);
        receipt.setCtaClickCount(0L);

        // Recompute totals server-side — a receipt shown to strangers must
        // never carry client-fabricated numbers under our branding.
        BigDecimal totalCost = receipt.getDistanceKm()
                .divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP)
                .multiply(receipt.getFuelConsumption())
                .multiply(receipt.getFuelPrice())
                .setScale(2, RoundingMode.HALF_UP);
        receipt.setTotalCost(totalCost);
        receipt.setCostPerPerson(totalCost
                .divide(BigDecimal.valueOf(receipt.getPeople()), 2, RoundingMode.HALF_UP));

        return ReceiptDTO.from(repository.save(receipt));
    }

    @Transactional
    public ReceiptDTO getBySlug(String slug) {
        TripReceipt receipt = repository.findBySlug(slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found"));
        if (isExpired(receipt)) {
            throw new ResponseStatusException(HttpStatus.GONE, "Receipt expired");
        }
        repository.incrementViewCount(slug);
        receipt.setViewCount(receipt.getViewCount() + 1); // echo the increment in the response
        return ReceiptDTO.from(receipt);
    }

    @Transactional
    public void registerCtaClick(String slug) {
        // Fire-and-forget metric; unknown slugs are ignored on purpose.
        repository.incrementCtaClickCount(slug);
    }

    @Transactional(readOnly = true)
    public List<ReceiptDTO> listForUser(Long userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().map(ReceiptDTO::from).toList();
    }

    @Transactional
    public void delete(String slug, Long userId) {
        TripReceipt receipt = repository.findBySlug(slug)
                // 404 (not 403) for foreign receipts: don't confirm existence to non-owners
                .filter(r -> userId != null && userId.equals(r.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found"));
        repository.delete(receipt);
    }

    @Transactional(readOnly = true)
    public Optional<TripReceipt> findForPreview(String slug) {
        return repository.findBySlug(slug).filter(r -> !isExpired(r));
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void cleanupExpired() {
        int deleted = repository.deleteExpired(LocalDateTime.now());
        if (deleted > 0) {
            logger.info("Deleted {} expired anonymous receipts", deleted);
        }
    }

    private boolean isExpired(TripReceipt receipt) {
        return receipt.getExpiresAt() != null && receipt.getExpiresAt().isBefore(LocalDateTime.now());
    }

    private String uniqueSlug() {
        for (int i = 0; i < SLUG_RETRIES; i++) {
            String slug = slugGenerator.next();
            if (!repository.existsBySlug(slug)) {
                return slug;
            }
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not allocate slug");
    }

    /** Strip HTML-significant chars and control chars; receipts render to strangers. */
    private String sanitizeLabel(String label) {
        if (label == null) return null;
        String cleaned = label
                .replaceAll("[<>\"'&\\p{Cntrl}]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (cleaned.isEmpty()) return null;
        return cleaned.length() > MAX_LABEL_LENGTH
                ? cleaned.substring(0, MAX_LABEL_LENGTH)
                : cleaned;
    }

    /** Geometry is decorative — invalid input is dropped, never a share-blocking error. */
    private String validGeometryOrNull(String geometry) {
        if (geometry == null || geometry.isBlank() || geometry.length() > MAX_GEOMETRY_CHARS) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(geometry);
            if (!root.isArray() || root.size() < 2 || root.size() > MAX_GEOMETRY_POINTS) {
                return null;
            }
            for (JsonNode point : root) {
                if (!point.isArray() || point.size() != 2
                        || !point.get(0).isNumber() || !point.get(1).isNumber()) {
                    return null;
                }
            }
            return geometry;
        } catch (Exception e) {
            return null;
        }
    }

    private void validateRange(Double value, double min, double max, String field) {
        if (value == null || value < min || value > max) {
            throw badRequest(field + " must be between " + min + " and " + max);
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
