package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;

    /**
     * Process OAuth2 user login - create new user or update existing user
     */
    @Transactional
    public User processOAuth2User(OAuth2User oauth2User) {
        String googleId = oauth2User.getAttribute("sub");
        String email = oauth2User.getAttribute("email");
        String name = oauth2User.getAttribute("name");
        String pictureUrl = oauth2User.getAttribute("picture");

        Optional<User> existingUser = userRepository.findByGoogleId(googleId);

        if (existingUser.isPresent()) {
            // Update existing user
            User user = existingUser.get();
            user.setEmail(email);
            user.setName(name);
            user.setPictureUrl(pictureUrl);
            user.setLastLogin(LocalDateTime.now());

            log.info("Updated existing user: {} ({})", name, email);
            return userRepository.save(user);
        } else {
            // Create new user
            User newUser = User.builder()
                    .googleId(googleId)
                    .email(email)
                    .name(name)
                    .pictureUrl(pictureUrl)
                    .lastLogin(LocalDateTime.now())
                    .build();

            log.info("Created new user: {} ({})", name, email);
            return userRepository.save(newUser);
        }
    }

    /**
     * Find user by Google ID
     */
    public Optional<User> findByGoogleId(String googleId) {
        return userRepository.findByGoogleId(googleId);
    }

    /**
     * Find user by email
     */
    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /**
     * Find user by ID
     */
    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    /**
     * Update user's last login timestamp
     */
    @Transactional
    public void updateLastLogin(Long userId) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setLastLogin(LocalDateTime.now());
            userRepository.save(user);
        });
    }
}
