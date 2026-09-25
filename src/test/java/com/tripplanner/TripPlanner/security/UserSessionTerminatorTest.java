package com.tripplanner.TripPlanner.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Runs against the real JDBC session store (H2 in tests). */
@SpringBootTest
class UserSessionTerminatorTest {

    @Autowired
    private FindByIndexNameSessionRepository<? extends Session> sessions;

    @Autowired
    private UserSessionTerminator terminator;

    // The JDBC session class isn't public, so go through the raw Session API.
    @SuppressWarnings({"unchecked", "rawtypes"})
    private String sessionFor(String principal) {
        FindByIndexNameSessionRepository repository = sessions;
        Session session = repository.createSession();
        session.setAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, principal);
        repository.save(session);
        return session.getId();
    }

    @Test
    void endsEverySessionOfOneUserAndNoOneElse() {
        String laptop = sessionFor("google-sub-1");
        String phone = sessionFor("google-sub-1");
        String someoneElse = sessionFor("google-sub-2");

        assertEquals(2, terminator.endAllSessions("google-sub-1"));

        assertNull(sessions.findById(laptop));
        assertNull(sessions.findById(phone));
        assertNotNull(sessions.findById(someoneElse));
    }

    @Test
    void unknownOrMissingPrincipalIsANoOp() {
        assertEquals(0, terminator.endAllSessions("nobody"));
        assertEquals(0, terminator.endAllSessions(null));
    }
}
