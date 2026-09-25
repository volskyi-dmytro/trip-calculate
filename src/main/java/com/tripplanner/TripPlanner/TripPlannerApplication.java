package com.tripplanner.TripPlanner;

import com.tripplanner.TripPlanner.config.DeployedProfileGuard;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling powers ReceiptService.cleanupExpired (nightly purge of expired anonymous receipts)
@SpringBootApplication
@EnableScheduling
public class TripPlannerApplication {

	public static void main(String[] args) {
		SpringApplication app = new SpringApplication(TripPlannerApplication.class);
		app.addListeners(new DeployedProfileGuard());
		app.run(args);
	}

}
