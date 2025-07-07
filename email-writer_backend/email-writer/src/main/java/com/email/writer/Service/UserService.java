package com.email.writer.Service;

import com.email.writer.Models.User;
import com.email.writer.Repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserService {



    private final UserRepository userRepository;

    public UserService(UserRepository repo) {
        this.userRepository = repo;
    }

    public User saveUser(String googleId, String email, String sessionKey) {
        return userRepository.findByEmail(email)
                .map(existingUser -> {
                    existingUser.setGoogleId(googleId);
                    existingUser.setSessionKey(sessionKey);
                    return userRepository.save(existingUser);
                })
                .orElseGet(() -> userRepository.save(new User(googleId, email, sessionKey)));
    }

    public String getSession(String email){
        return userRepository.findByEmail(email).map(User::getSessionKey)
                                                     .orElse(null);
    }

}
