package com.email.writer.Controller;

import com.email.writer.Models.User;
import com.email.writer.Service.AuthService;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Data
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private final AuthService authService;

    @PostMapping("/google/verify")
    public ResponseEntity<?> verifyToken(@RequestBody Map<String, String> body) {
        try {
            String token = body.get("token");
            if (token == null || token.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Token is missing"));
            }
            User user = authService.verifyGoogleTokenAndLogin(token);
            // Assuming your User object has the sessionKey
            return ResponseEntity.ok(Map.of("sessionKey", user.getSessionKey()));
        } catch (Exception e) {
            // Log the exception
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Login failed: " + e.getMessage()));
        }
    }
}
