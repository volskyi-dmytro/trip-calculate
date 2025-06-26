package com.tripplanner.TripPlanner.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class CustomErrorController implements ErrorController {

    @RequestMapping("/error")
    public ResponseEntity<String> handleError(HttpServletRequest request) {
        Integer statusCode = (Integer) request.getAttribute("jakarta.servlet.error.status_code");

        if (statusCode != null) {
            HttpStatus httpStatus = HttpStatus.valueOf(statusCode);

            String errorMessage = switch (statusCode) {
                case 403 -> "403 - Access Forbidden: You don't have permission to access this resource.";
                case 404 -> "404 - Not Found: The requested resource was not found.";
                case 500 -> "500 - Internal Server Error: Something went wrong on our end.";
                default -> statusCode + " - " + httpStatus.getReasonPhrase();
            };

            String htmlResponse = """
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Access Denied</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        h1 { color: #d32f2f; }
                        p { color: #666; }
                    </style>
                </head>
                <body>
                    <h1>%s</h1>
                    <p>Return to <a href="/">homepage</a></p>
                </body>
                </html>
                """.formatted(errorMessage);

            return ResponseEntity.status(httpStatus)
                    .header("Content-Type", "text/html")
                    .body(htmlResponse);
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .header("Content-Type", "text/html")
                .body("<h1>500 - Internal Server Error</h1>");
    }

}
