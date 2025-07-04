package com.email.writer.ExceptionHandling;

public class GeminiQuotaExceededException extends RuntimeException {
    public GeminiQuotaExceededException(String message) {
        super(message);
    }
}