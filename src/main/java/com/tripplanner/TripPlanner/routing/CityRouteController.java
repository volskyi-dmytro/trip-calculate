package com.tripplanner.TripPlanner.routing;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Read-only catalog + per-route facts for the programmatic city-route SEO
 * landing pages ({@code /{locale}/route/{slug}}, served by SpaShellController).
 */
@RestController
@RequestMapping("/api/city-routes")
@RequiredArgsConstructor
public class CityRouteController {

    private final CityRouteService cityRouteService;

    @GetMapping
    public List<Map<String, Object>> list() {
        return cityRouteService.all().stream()
                .map(r -> Map.<String, Object>of(
                        "slug", r.slug(),
                        "from", Map.of("uk", r.from().uk(), "en", r.from().en()),
                        "to", Map.of("uk", r.to().uk(), "en", r.to().en())))
                .toList();
    }

    @GetMapping("/{slug}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String slug,
                                                     @RequestParam(defaultValue = "uk") String locale) {
        return cityRouteService.get(slug, locale)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
