package com.email.writer.Service;

import com.email.writer.ExceptionHandling.GeminiQuotaExceededException;
import com.email.writer.ExceptionHandling.GeminiTimeoutException;
import com.email.writer.ExceptionHandling.PromptTooLargeException;
import com.email.writer.Models.EmailRequest;
import com.email.writer.Models.GoogleTokenInfo; // Import the new model
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.Objects;

@Service
public class EmailGeneratorService {

    @Autowired
    private RateLimitingService rateLimiter;



    private final WebClient webClient;
    private final ObjectMapper objectMapper; // Added ObjectMapper for JSON parsing

    @Value("${gemini.api.url}")
    private String geminiAPiUrl;
    @Value("${gemini.api.key}")
    private String geminiApiKey;

    @Value("${google.oauth2.client-id}") // New property for your Google OAuth2 Client ID
    private String googleOAuth2ClientId;

    @Value("${limit}")
    private Integer promptLimit;

    public EmailGeneratorService(WebClient.Builder webClientBuilder, ObjectMapper objectMapper) {
        this.webClient = webClientBuilder.build();
        this.objectMapper = objectMapper; // Initialize ObjectMapper
    }

    /**
     * Verifies the Google OAuth2 access token and extracts the user's email.
     * @param authorizationHeader The full Authorization header string (e.g., "Bearer YOUR_TOKEN").
     * @return The user's email address.
     * @throws SecurityException if the token is invalid, expired, or verification fails.
     */
    private String verifyGoogleAccessTokenAndGetEmail(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new SecurityException("Missing or invalid Authorization header.");
        }
        String accessToken = authorizationHeader.substring("Bearer ".length());

        try {
            // Call Google's tokeninfo endpoint to verify the access token
            GoogleTokenInfo tokenInfo = webClient.get()
                    .uri("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + accessToken)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError(), // Corrected line
                            response -> Mono.error(new SecurityException("Invalid Google Access Token.")))
                    .onStatus(status -> status.is5xxServerError(), // Corrected line
                            response -> Mono.error(new RuntimeException("Google TokenInfo service error.")))
                    .bodyToMono(GoogleTokenInfo.class)
                    .block(); // Blocking call, consider making this reactive if your service becomes fully reactive

            // Basic validation of the token info
            if (tokenInfo == null || tokenInfo.getEmail() == null || tokenInfo.getEmail().isEmpty() ||
                    !Objects.equals(tokenInfo.getAud(), googleOAuth2ClientId) ||
                    !"true".equals(tokenInfo.getEmailVerified())) {
                throw new SecurityException("Google Access Token validation failed.");
            }

            // You can also check tokenInfo.getExp() for expiration if needed,
            // but Google's endpoint usually handles expired tokens by returning 4xx.

            System.out.println("User email from Google: " + tokenInfo.getEmail());
            return tokenInfo.getEmail();

        } catch (SecurityException e) {
            throw e; // Re-throw security exceptions
        } catch (Exception e) {
            System.err.println("Error verifying Google token: " + e.getMessage());
            throw new RuntimeException("Failed to verify Google token.", e);
        }
    }

    // non streaming prompt for subject line.
    private String sendPromptToGemini(String prompt) {
        Map<String, Object> requestBody = Map.of("contents", new Object[] {
                Map.of("parts", new Object[] {
                        Map.of("text", prompt)
                })
        });
        String x = geminiAPiUrl+"generateContent"+"?key=";
        String response = webClient.post()
                .uri(x + geminiApiKey)
                .header("Content-Type", "application/json")
                .bodyValue(requestBody)
                .retrieve()
                .onStatus(status -> status.value() == 429,
                        res -> Mono.error(new GeminiQuotaExceededException("Gemini quota exceeded")))
                .onStatus(status -> status.value() == 504,
                        res -> Mono.error(new GeminiTimeoutException("Gemini API timed out")))
                .onStatus(status -> status.is5xxServerError(),
                        res -> Mono.error(new Exception("Gemini 5xx error")))
                .bodyToMono(String.class)
                .block();

        return extractResponseContent(response);
    }

    private String extractResponseContent(String response) {
        try {
            JsonNode rootNode = objectMapper.readTree(response); // Use injected ObjectMapper
            return rootNode.path("candidates")
                    .get(0)
                    .path("content")
                    .path("parts")
                    .get(0)
                    .path("text")
                    .asText();
        } catch (Exception e) {
            throw new RuntimeException("Error parsing Gemini response", e);
        }
    }

    public String generateSubject(String authorizationHeader, EmailRequest emailRequest) {
        String userEmail = verifyGoogleAccessTokenAndGetEmail(authorizationHeader);
        emailRequest.setUserEmail(userEmail); // Set the user email in the request object

        // global limits
        if (!rateLimiter.isAllowed("global", 15, 200)) {
            throw new GeminiQuotaExceededException("API usage limit reached. Please wait.");
        }

        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("Gemini quota exceeded");
        }


        String prompt = buildPrompt(emailRequest, 2);
        return sendPromptToGemini(prompt);
    }

    // streaming o/p from gemini
    public Flux<String> streamPromptToGemini(String prompt) {
        Map<String, Object> requestBody = Map.of("contents", new Object[] {
                Map.of("parts", new Object[] {
                        Map.of("text", prompt)
                })
        });
        String x = geminiAPiUrl+"streamGenerateContent"+"?key=";

        return webClient.post()
                .uri(x+geminiApiKey) // streamGenerateContent endpoint
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_NDJSON)
                .bodyValue(requestBody)
                .retrieve()
                .onStatus(status -> status.value() == 429,
                        res -> Mono.error(new GeminiQuotaExceededException("Gemini quota exceeded")))
                .onStatus(status -> status.value() == 504,
                        res -> Mono.error(new GeminiTimeoutException("Gemini API timed out")))
                .onStatus(status -> status.is5xxServerError(),
                        res -> Mono.error(new Exception("Gemini 5xx error")))
                .bodyToFlux(JsonNode.class)
                .map(jsonNode -> jsonNode
                        .path("candidates").get(0)
                        .path("content").path("parts").get(0)
                        .path("text").asText()
                );
    }

    public Flux<String> generateEmail(String authorizationHeader, EmailRequest emailRequest) {
        String userEmail = verifyGoogleAccessTokenAndGetEmail(authorizationHeader);
        emailRequest.setUserEmail(userEmail); // Set the user email in the request object

        // global limits
        if (!rateLimiter.isAllowed("global", 15, 200)) {
            throw new GeminiQuotaExceededException("API usage limit reached. Please wait.");
        }

        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("Gemini quota exceeded");
        }

        String prompt = buildPrompt(emailRequest, 1);
        if (prompt.length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }
        return streamPromptToGemini(prompt);
    }

    public Flux<String> generateEmailReply(String authorizationHeader, EmailRequest emailRequest) {
        String userEmail = verifyGoogleAccessTokenAndGetEmail(authorizationHeader);
        emailRequest.setUserEmail(userEmail); // Set the user email in the request object

        // global limits
        if (!rateLimiter.isAllowed("global", 15, 200)) {
            throw new GeminiQuotaExceededException("API usage limit reached. Please wait.");
        }


        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("Gemini quota exceeded");
        }

        String prompt = buildPrompt(emailRequest, 0);
        if (prompt.length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }
        return streamPromptToGemini(prompt);
    }

    // In EmailGeneratorService.java
    private int calculateWordCount(String text) {
        if (text == null || text.trim().isEmpty()) {
            return 0;
        }
        // This regex handles multiple spaces between words gracefully.
        String[] words = text.trim().split("\\s+");
        return words.length;
    }

    public Flux<String> generateContent(String authorizationHeader, EmailRequest emailRequest) {
        String userEmail = verifyGoogleAccessTokenAndGetEmail(authorizationHeader);
        emailRequest.setUserEmail(userEmail); // Set the user email in the request object

        // global limits
        if (!rateLimiter.isAllowed("global", 15, 200)) {
            throw new GeminiQuotaExceededException("API usage limit reached. Please wait.");
        }


        
        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("Gemini quota exceeded");
        }

        StringBuilder prompt = new StringBuilder();

        String originalText = emailRequest.getEmailContent();
        int originalWordCount = calculateWordCount(originalText);

        prompt.append("Example 1:\n");
        prompt.append("Original Text: \"The quick brown fox jumps over the lazy dog.\" (9 words)\n");
        prompt.append("Rewrite: A swift, russet fox leaps above the sluggish canine.\n\n");

        prompt.append("Your primary task is to rewrite the following original text into a single, continuous block. No paragraph breaks, no extra newlines within the text.");
        prompt.append("It is **absolutely critical** that the rewritten text maintains the *exact same word count* as the original. You must not add or remove any words; only rephrase the existing content.");
        prompt.append("Adopt a professional and formal tone throughout the rewrite.\n");
        prompt.append("If the word count of your rewrite is not identical to the original, or if you introduce any paragraph breaks, the response will be considered incorrect and unusable.\n");
        prompt.append("Respond with *only* the rewritten text, without any introductory phrases like 'Here is the rewrite:' or concluding remarks.\n\n");

        prompt.append("Original Text: \"").append(originalText).append("\" (").append(originalWordCount).append(" words)\n");
        prompt.append("Rewrite:");

        if (prompt.toString().length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }

        return streamPromptToGemini(prompt.toString());
    }

    private String buildPrompt(EmailRequest emailRequest, int flag) {
        StringBuilder prompt = new StringBuilder();

        if (flag == 2) {
            prompt.append("Generate a concise and appropriate subject line for the following email content. Respond with only the subject line, nothing else:\n")
                    .append(emailRequest.getUserInput());
            return prompt.toString();
        }

        if (flag == 0) {
            prompt.append("Draft a professional and concise email reply to the following. Do not include a subject line.");
        } else {
            prompt.append("Compose a well-structured email incorporating the provided key points. Do not include a subject line.");
        }

        String tone = (emailRequest.getTone() != null && !emailRequest.getTone().isEmpty()) ? emailRequest.getTone() : "professional";
        prompt.append(" Maintain a ").append(tone).append(" tone.");

        if (flag == 0) {
            prompt.append("\n\nOriginal Email to reply to:\n").append(emailRequest.getEmailContent())
                    .append("\n\nPoints to address in the reply:\n");
            if (emailRequest.getUserInput() != null && !emailRequest.getUserInput().isEmpty()) {
                prompt.append(emailRequest.getUserInput());
            } else {
                prompt.append("No specific points provided, reply generally based on the original email.");
            }
        } else {
            prompt.append("\n\nKey points to include in the email:\n").append(emailRequest.getUserInput());
            System.out.println(emailRequest.getUserInput());
        }

        prompt.append("\n\nEmail Length: ");
        switch (emailRequest.getLength()) {
            case "short":
                prompt.append("Keep the email brief, around 50-100 words. Avoid multiple paragraphs.");
                break;
            case "long":
                prompt.append("Make the email comprehensive, between 200-400 words. Use multiple paragraphs for clarity.");
                break;
            case "crisp":
                prompt.append("Provide a very direct response, under 10 words.");
                break;
            case null, default:
                prompt.append("Generate an email of appropriate length for the context, typically 100-200 words, with a clear and professional structure.");
                break;
        }

        prompt.append("\n\nFormatting Guidelines:\n");
        prompt.append("Please write your response using a single asterisk (*) on a separate line to indicate each paragraph break. Do not use any other newlines between paragraphs, and ensure your response does not end with an asterisk.\n");
        prompt.append("- Do not generate a subject line.\n");
        prompt.append("- Provide only the email content, ready to be sent directly, without any introductory phrases like 'Here's the AI-generated email:'.");

        return prompt.toString();
    }
}
