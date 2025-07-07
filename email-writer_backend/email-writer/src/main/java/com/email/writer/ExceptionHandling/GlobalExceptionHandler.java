package com.email.writer.ExceptionHandling;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(GeminiTimeoutException.class)
    public ResponseEntity<?> handleGeminiTimeout(GeminiTimeoutException ex) {
        return buildResponse(ex.getMessage(), "GEMINI_TIMEOUT", HttpStatus.GATEWAY_TIMEOUT);
    }

    @ExceptionHandler(PromptTooLargeException.class)
    public ResponseEntity<?> handlePromptTooLarge(PromptTooLargeException ex) {
        return buildResponse(ex.getMessage(), "PROMPT_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE);
    }

    @ExceptionHandler(GeminiQuotaExceededException.class)
    public ResponseEntity<?> handleQuotaExceeded(GeminiQuotaExceededException ex) {
        return buildResponse(ex.getMessage(), "GEMINI_QUOTA_EXCEEDED", HttpStatus.TOO_MANY_REQUESTS);
    }

    @ExceptionHandler(SessionInvalidException.class)
    public ResponseEntity<?> handleInvalidSession(SessionInvalidException ex) {
        return buildResponse(ex.getMessage(), "SESSION_INVALID", HttpStatus.UNAUTHORIZED);
    }

    //catches everyother exception now.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleAll(Exception ex) {
        return buildResponse("Something went wrong", "INTERNAL_SERVER_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    private ResponseEntity<Map<String, Object>> buildResponse(String msg, String code, HttpStatus status) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("error", msg);
        body.put("code", code);
        return new ResponseEntity<>(body, status);
    }
}

