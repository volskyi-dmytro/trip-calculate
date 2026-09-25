package com.tripplanner.TripPlanner.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Ends every stored login session of one user, on every device.
 *
 * <p>Spring Session indexes sessions by principal name, which for Google logins
 * is the account's {@code sub} claim (our {@code User.googleId}): both user
 * services build their principals with "sub" as the name attribute.
 */
@Component
public class UserSessionTerminator {

    private static final Logger log = LoggerFactory.getLogger(UserSessionTerminator.class);

    private final FindByIndexNameSessionRepository<? extends Session> sessions;

    public UserSessionTerminator(FindByIndexNameSessionRepository<? extends Session> sessions) {
        this.sessions = sessions;
    }

    /** @return how many sessions were ended */
    public int endAllSessions(String principalName) {
        if (principalName == null || principalName.isBlank()) {
            return 0;
        }
        Map<String, ? extends Session> found = sessions.findByPrincipalName(principalName);
        found.keySet().forEach(sessions::deleteById);
        if (!found.isEmpty()) {
            log.info("Ended {} session(s) after an account change", found.size());
        }
        return found.size();
    }
}
