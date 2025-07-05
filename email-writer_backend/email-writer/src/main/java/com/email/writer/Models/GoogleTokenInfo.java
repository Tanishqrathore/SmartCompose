package com.email.writer.Models;

import lombok.Data;
import com.fasterxml.jackson.annotation.JsonProperty;

@Data
public class GoogleTokenInfo {
    private String azp; // Authorized party - client_id
    private String aud; // Audience - your client_id
    private String sub; // User's unique Google ID
    private String scope; // Scopes granted
    private String exp; // Expiration time (Unix timestamp)
    private String email; // User's email address
    @JsonProperty("email_verified")
    private String emailVerified; // "true" or "false"
    private String access_type; // e.g., "online"
}
