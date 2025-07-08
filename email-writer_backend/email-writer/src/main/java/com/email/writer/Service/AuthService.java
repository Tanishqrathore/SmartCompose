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

    private final RedisService redisService;
    private final UserService userService;

    private static final SecureRandom secureRandom = new SecureRandom();
    private static final Base64.Encoder base64Encoder = Base64.getUrlEncoder().withoutPadding();

    @Value("${google.client-id}")
    private String clientId;



    public AuthService(UserService userService, RedisService redisService) {
        this.userService = userService;
        this.redisService = redisService;
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
        //this can happen,that same email se a person is loggining from somewherelse: we also need to invalidate current running session
        //if that exists(from redis);(but not that email's assigned tokens:)
        String exists =  userService.getSession(email);
        if(exists!=null){
            redisService.deleteKey(exists);}

        redisService.saveSession(sessionKey, email);

        // Save user to your database
        return userService.saveUser(googleId, email, sessionKey);
    }

    public String generateSessionKey() {
        byte[] randomBytes = new byte[32]; // 256 bits
        secureRandom.nextBytes(randomBytes);
        return base64Encoder.encodeToString(randomBytes);
    }
}
