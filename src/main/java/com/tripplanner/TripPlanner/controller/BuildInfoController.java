package com.tripplanner.TripPlanner.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Which build is running? /actuator is denyAll, so release identity had no public read path.
 * The commit is not sensitive (the repository is public); it is "unknown" unless the image build
 * passes GIT_SHA.
 */
@RestController
@RequestMapping("/api/build-info")
public class BuildInfoController {

    private final String commit;

    public BuildInfoController(@Value("${app.git-sha:unknown}") String commit) {
        this.commit = commit;
    }

    @GetMapping
    public ResponseEntity<Map<String, String>> buildInfo() {
        return ResponseEntity.ok(Map.of("commit", commit));
    }
}
