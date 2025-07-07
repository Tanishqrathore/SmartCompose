package com.email.writer.Service;

import com.email.writer.Models.User;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Collections;

@Service
public class AuthService {

    private final SessionService sessionService;
    private final UserService userService;

    private static final SecureRandom secureRandom = new SecureRandom();
    private static final Base64.Encoder base64Encoder = Base64.getUrlEncoder().withoutPadding();

    @Value("${google.client-id}")
    private String clientId;



    public AuthService(UserService userService, SessionService sessionService) {
        this.userService = userService;
        this.sessionService = sessionService;
    }


    public User verifyGoogleTokenAndLogin(String idTokenString) throws Exception {
        // Step 1: Verify the ID Token
        final GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                .setAudience(Collections.singletonList(clientId))
                .build();

        GoogleIdToken idToken = verifier.verify(idTokenString);
        if (idToken == null) {
            throw new Exception("Invalid ID Token. It could not be verified.");
        }

        GoogleIdToken.Payload payload = idToken.getPayload();


        String googleId = payload.getSubject();
        String email = payload.getEmail();

        if (googleId == null || email == null) {
            throw new Exception("Required user information (ID, email) not present in token.");
        }

        // Step 3: Create a session and save the user (your existing logic)
        String sessionKey = generateSessionKey();

        // Save session to Redis
        sessionService.saveSession(sessionKey, email);

        // Save user to your database
        return userService.saveUser(googleId, email, sessionKey);
    }

    public String generateSessionKey() {
        byte[] randomBytes = new byte[32]; // 256 bits
        secureRandom.nextBytes(randomBytes);
        return base64Encoder.encodeToString(randomBytes);
    }
}
