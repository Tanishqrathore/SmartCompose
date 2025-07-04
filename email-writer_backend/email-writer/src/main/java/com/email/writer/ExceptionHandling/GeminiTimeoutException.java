package com.email.writer.ExceptionHandling;

public class GeminiTimeoutException extends RuntimeException {
    public GeminiTimeoutException(String message) {
        super(message);
    }
}