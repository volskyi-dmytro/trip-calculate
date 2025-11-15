package com.tripplanner.TripPlanner.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Fallback controller for React SPA routing
 *
 * Forwards all non-API, non-static routes to index.html
 * so React Router can handle client-side routing
 */
@Controller
public class SpaFallbackController {

    @GetMapping({
        "/dashboard",
        "/admin",
        "/profile",
        "/route-planner",
        "/trips/**",
        "/routes/**"
    })
    public String forward() {
        return "forward:/index.html";
    }
}
