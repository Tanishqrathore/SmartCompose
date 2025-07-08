package com.email.writer.Controller;


import com.email.writer.Models.EmailRequest;
import com.email.writer.Service.EmailGeneratorService;
import com.email.writer.Service.UserStyleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class UserStyleController {

    private final UserStyleService userStyleService;

    @PostMapping("/style")
    public ResponseEntity<String> UserStyle(
            @RequestHeader("Authorization") String sessionKey,
            @RequestBody EmailRequest emailRequest) {
          userStyleService.setUserStyle(emailRequest,sessionKey);
        return ResponseEntity.status(HttpStatus.CREATED).body("Style saved successfully");
    }
}
