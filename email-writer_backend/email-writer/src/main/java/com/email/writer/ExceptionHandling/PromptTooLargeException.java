package com.email.writer.ExceptionHandling;

public class PromptTooLargeException extends RuntimeException {
    public PromptTooLargeException(String message) {
        super(message);
    }
}