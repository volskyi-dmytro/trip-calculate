package com.tripplanner.TripPlanner.service;

import org.springframework.stereotype.Component;

/**
 * Resolves which locale a first-time visitor should be redirected to.
 * Falls back to "uk" — the app's existing default — unless the visitor's
 * Accept-Language header clearly ranks English ahead of Ukrainian.
 *
 * Named AppLocaleResolver (not LocaleResolver) because Spring MVC's
 * DispatcherServlet reserves the bean name "localeResolver" for its own
 * org.springframework.web.servlet.LocaleResolver — a class literally named
 * LocaleResolver auto-registers under that exact bean name and crashes
 * DispatcherServlet with a BeanNotOfRequiredTypeException at startup.
 */
@Component
public class AppLocaleResolver {

    public String resolve(String acceptLanguageHeader) {
        if (acceptLanguageHeader == null || acceptLanguageHeader.isBlank()) {
            return "uk";
        }
        String header = acceptLanguageHeader.toLowerCase();
        int enIndex = header.indexOf("en");
        int ukIndex = header.indexOf("uk");
        if (enIndex == -1) {
            return "uk";
        }
        if (ukIndex == -1) {
            return "en";
        }
        return enIndex < ukIndex ? "en" : "uk";
    }
}
