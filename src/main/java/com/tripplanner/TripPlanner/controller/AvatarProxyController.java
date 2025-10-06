package com.tripplanner.TripPlanner.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/avatar")
@Slf4j
public class AvatarProxyController {

    /**
     * Proxy Google profile images to avoid CORS and rate limiting issues
     */
    @GetMapping("/proxy")
    public ResponseEntity<byte[]> proxyAvatar(@RequestParam String url) {
        try {
            // Validate URL is from Google
            if (!url.startsWith("https://lh3.googleusercontent.com/") &&
                !url.startsWith("https://lh4.googleusercontent.com/") &&
                !url.startsWith("https://lh5.googleusercontent.com/") &&
                !url.startsWith("https://lh6.googleusercontent.com/")) {
                log.warn("Attempted to proxy non-Google URL: {}", url);
                return ResponseEntity.badRequest().build();
            }

            RestTemplate restTemplate = new RestTemplate();
            byte[] imageBytes = restTemplate.getForObject(url, byte[].class);

            if (imageBytes == null) {
                return ResponseEntity.notFound().build();
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_JPEG);
            headers.setCacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic());

            return new ResponseEntity<>(imageBytes, headers, HttpStatus.OK);

        } catch (Exception e) {
            log.error("Error proxying avatar image: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
