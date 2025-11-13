package com.tripplanner.TripPlanner.service;

import com.tripplanner.TripPlanner.entity.User;
import com.tripplanner.TripPlanner.entity.UserRole;
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

            // Ensure role is set (for users created before role column was added)
            if (user.getRole() == null) {
                user.setRole(UserRole.USER);
                log.info("Set default role for existing user ID: {}", user.getId());
            }

            log.info("Updated existing user ID: {}", user.getId());
            return userRepository.save(user);
        } else {
            // Create new user with default USER role
            User newUser = User.builder()
                    .googleId(googleId)
                    .email(email)
                    .name(name)
                    .pictureUrl(pictureUrl)
                    .role(UserRole.USER)  // Explicitly set default role
                    .lastLogin(LocalDateTime.now())
                    .build();

            User savedUser = userRepository.save(newUser);
            log.info("Created new user ID: {} with role: {}", savedUser.getId(), UserRole.USER);
            return savedUser;
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

    /**
     * Save or update user
     */
    @Transactional
    public User save(User user) {
        return userRepository.save(user);
    }
}
