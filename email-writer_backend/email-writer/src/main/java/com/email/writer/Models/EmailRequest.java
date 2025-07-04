package com.email.writer.Models;

import lombok.Data;

@Data
public class EmailRequest {
    private String userInput;
    private String emailContent;
    private String tone;
    private String length;
}
