package com.tripplanner.TripPlanner;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling powers ReceiptService.cleanupExpired (nightly purge of expired anonymous receipts)
@SpringBootApplication
@EnableScheduling
public class TripPlannerApplication {

	public static void main(String[] args) {
		SpringApplication.run(TripPlannerApplication.class, args);
	}

}
