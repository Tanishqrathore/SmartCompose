package com.email.writer.Service;

import com.email.writer.ExceptionHandling.GeminiQuotaExceededException;
import com.email.writer.ExceptionHandling.GeminiTimeoutException;
import com.email.writer.ExceptionHandling.PromptTooLargeException;
import com.email.writer.ExceptionHandling.SessionInvalidException;
import com.email.writer.Models.EmailRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;

@Service
public class EmailGeneratorService {

    @Autowired
    private RateLimitingService rateLimiter;



    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final RedisService redisService;


    @Value("${gemini.api.url}")
    private String geminiAPiUrl;
    @Value("${gemini.api.key}")
    private String geminiApiKey;


    @Value("${limit}")
    private Integer promptLimit;

    public EmailGeneratorService(WebClient.Builder webClientBuilder, ObjectMapper objectMapper, RedisService redisService) {
        this.webClient = webClientBuilder.build();
        this.objectMapper = objectMapper;
        this.redisService = redisService;
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
            JsonNode rootNode = objectMapper.readTree(response);
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

    public String generateSubject(String passcode,EmailRequest emailRequest) {
        String userEmail = redisService.getEmail(passcode);
        if(userEmail==null){throw new SessionInvalidException("Please login");}



        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("User quota exceeded.Please try again later.");
        }



        String prompt = buildPrompt(emailRequest, 2,"follow professional tone");
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

    public Flux<String> generateEmail(String passcode,EmailRequest emailRequest) {
        String userEmail = redisService.getEmail(passcode);
        if(userEmail==null){throw new SessionInvalidException("Please login");}

        if (!rateLimiter.isAllowed(userEmail, 15, 200)) {
            throw new GeminiQuotaExceededException("User quota exceeded.Please try again later.");
        }

        String style = redisService.getStyle(userEmail);
        if(style==null){style="Follow a professional style";}

        String prompt = buildPrompt(emailRequest, 1,style);
        if (prompt.length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }
        return streamPromptToGemini(prompt);
    }

    public Flux<String> generateEmailReply(String passcode,EmailRequest emailRequest) {
        String userEmail = redisService.getEmail(passcode);




        //per user limit
        if (!rateLimiter.isAllowed(userEmail, 5, 200)) {
            throw new GeminiQuotaExceededException("User quota exceeded.Please try again later.");
        }

        String style = redisService.getStyle(userEmail);
        if(style==null){style="Follow a professional style";}

        String prompt = buildPrompt(emailRequest, 0,style);
        if (prompt.length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }
        return streamPromptToGemini(prompt);
    }


    private int calculateWordCount(String text) {
        if (text == null || text.trim().isEmpty()) {
            return 0;
        }

        String[] words = text.trim().split("\\s+");
        return words.length;
    }

    public Flux<String> generateContent(String passcode,EmailRequest emailRequest) {

        //session confirmation;
        String userEmail = redisService.getEmail(passcode);
        if(userEmail==null){throw new SessionInvalidException("Please login");}


        //rate limiting;
        if (!rateLimiter.isAllowed(userEmail, 15, 200)) {
            throw new GeminiQuotaExceededException("User quota exceeded.Please try again later.");
        }
        String style = redisService.getStyle(userEmail);
        if(style==null){style="Follow a professional style";}

        StringBuilder prompt = new StringBuilder();

        // --- 1. Define Style (with improved clarity and fallback) ---
        // Ensure style has meaningful content; otherwise, set a default.
        String actualStyle = (style != null && !style.trim().isEmpty() && style.trim().length() > 10)
                ? style.trim()
                : "a standard, clear, and professional writing style";

        prompt.append("PRIORITY 1: Emulate the writing style provided below throughout your rewrite.\n");
        prompt.append("The style sample is for stylistic reference ONLY. Do NOT extract content or facts from it.\n");
        prompt.append("If the provided style is unclear or contradictory, revert to a standard professional writing style for the rewrite.\n");
        prompt.append("--- STYLE SAMPLE START ---\n").append(actualStyle).append("\n--- STYLE SAMPLE END ---\n\n");


        // --- 2. Define Core Task & Critical Constraints (Highly Emphasized) ---
        prompt.append("PRIORITY 2: Your core task is to REWRITE the 'Original Text' provided below.\n");
        prompt.append("It is **ABSOLUTELY CRITICAL** that the rewritten text adheres to the following non-negotiable rules:\n");
        prompt.append("- The rewritten text MUST be a **single, continuous block** of text. No paragraph breaks, no extra newlines, no bullet points, no numbered lists.\n");
        prompt.append("- The rewritten text MUST maintain the **EXACT SAME WORD COUNT** as the 'Original Text'. Do NOT add or remove a single word. Only rephrase existing content.\n\n");


        // --- 3. Provide Example (Reinforced with rules) ---
        // Make the example even more explicit about the word count and single block rule.
        prompt.append("--- EXAMPLE START ---\n");
        prompt.append("Original Text: \"The quick brown fox jumps over the lazy dog.\" (9 words)\n");
        prompt.append("User Demand: Make it more formal.\n");
        prompt.append("Rewrite: \"A swift, russet fox leaps above the sluggish canine.\" (9 words)\n"); // Add word count to example rewrite
        prompt.append("--- EXAMPLE END ---\n\n");


        // --- 4. User Demand & Tone ---
        String originalText = emailRequest.getEmailContent();
        String modifyRequest = (emailRequest.getUserInput() != null && !emailRequest.getUserInput().trim().isEmpty())
                ? emailRequest.getUserInput().trim()
                : "Rephrase the content while maintaining its original meaning."; // Default user demand



        prompt.append("User Demand for Rewrite: ").append(modifyRequest).append("\n");
        prompt.append("Tone for Rewrite: Adopt a professional and formal tone throughout.\n\n"); // Keep this if always formal

        // --- 5. Output Instructions (Very Specific) ---
        prompt.append("--- REWRITE INSTRUCTIONS ---\n");
        prompt.append("1. Read the 'Original Text' and the 'User Demand' carefully.\n");
        prompt.append("2. Apply the specified 'Tone' and emulate the 'STYLE SAMPLE'.\n");
        prompt.append("3. Rewrite the text, ensuring it is a single, continuous block.\n");
        prompt.append("4. Verify that the rewritten text has the **IDENTICAL WORD COUNT** as the Original Text.\n");
        prompt.append("5. Provide **ONLY** the rewritten text. Do NOT include introductory phrases (e.g., \"Here is the rewrite:\", \"Rewritten:\"), original text, word counts, or any other additional commentary.\n");
        prompt.append("Ensure the rewritten text is **properly punctuated**, with all **necessary capital letters**, and correct grammar.");
        prompt.append("--- END REWRITE INSTRUCTIONS ---\n\n");


        // --- 6. The Actual Task Input ---
        prompt.append("Original Text: \"").append(originalText).append("\" (");
        prompt.append("Rewrite:");


        if (prompt.toString().length() > promptLimit) {
            throw new PromptTooLargeException("Prompt exceeds Gemini's maximum allowed size.");
        }

        return streamPromptToGemini(prompt.toString());
    }

    private String buildPrompt(EmailRequest emailRequest, int flag, String style) {
        StringBuilder prompt = new StringBuilder();

        // --- Style Injection (Refined for Emulation and Fallback) ---
        if (style != null && !style.trim().isEmpty() && style.trim().length() > 10) { // Add a length check for meaningful style
            prompt.append("PRIORITY: Emulate the writing style of the following text throughout your response.\n")
                    .append("The text is provided for stylistic reference ONLY. Do NOT extract or include any content, facts, or topics from this style sample into the generated email. Focus purely on tone, vocabulary, sentence structure, and overall presentation.\n")
                    .append("If the provided style is too short, unclear, or contradictory, revert to a standard professional writing style for the generated email.\n")
                    .append("--- STYLE SAMPLE START ---\n")
                    .append(style.trim()).append("\n") // Trim whitespace for cleaner input
                    .append("--- STYLE SAMPLE END ---\n\n");
        } else {
            // Explicitly state fallback if no style is provided or it's too short
            prompt.append("PRIORITY: Use a standard professional writing style for the generated email.\n\n");
        }

        // --- Core Task Definition ---
        prompt.append("Your task is to generate an email based on the following instructions.\n")
                .append("Do NOT include a subject line unless explicitly asked to (only for Flag 2).");


        // --- Flag 2: Subject Line Generation ---
        if (flag == 2) {
            // More precise instruction for subject line
            prompt.append("Generate only a concise, relevant, and appropriate subject line for the following email content. Provide ONLY the subject line text, with no additional words, punctuation, or formatting around it.\n")
                    .append("Email Content for Subject:\n").append(emailRequest.getUserInput());
            return prompt.toString();
        }

        // --- Flag 0: Email Reply ---
        // --- Flag 1: Compose New Email ---
        if (flag == 0) {
            prompt.append("\n\nObjective: Draft an email reply.");
        } else { // flag == 1
            prompt.append("\n\nObjective: Compose a new email.");
        }

        // --- Tone Preference (with clear default) ---
        String tone = (emailRequest.getTone() != null && !emailRequest.getTone().isEmpty()) ? emailRequest.getTone().toLowerCase() : "professional";
        // Using an explicit instruction for tone
        prompt.append("\nTone: Ensure the email's tone is strictly ").append(tone).append(".");


        // --- Content Inclusion based on Flag ---
        if (flag == 0) {
            prompt.append("\n\nOriginal Email Context (for reply):\n").append(emailRequest.getEmailContent());
            prompt.append("\n\nKey Points to Address in the Reply:\n");
            if (emailRequest.getUserInput() != null && !emailRequest.getUserInput().isEmpty()) {
                prompt.append(emailRequest.getUserInput());
            } else {
                prompt.append("No specific points provided. Generate a general and polite reply based on the Original Email Context.");
            }
        } else { // flag == 1
            prompt.append("\n\nCore Information to Include:\n").append(emailRequest.getUserInput());
            // System.out.println(emailRequest.getUserInput()); // This is a server-side log, good for debugging
        }

        // --- Length Control (Refined with more specific ranges) ---
        prompt.append("\n\nEmail Length Guidelines:");
        switch (emailRequest.getLength() != null ? emailRequest.getLength().toLowerCase() : "default") {
            case "short":
                prompt.append(" The email should be concise, approximately 75-125 words. Use 1-2 paragraphs.");
                break;
            case "long":
                prompt.append(" The email should be comprehensive, approximately 250-400 words. Use 3-5 well-developed paragraphs for clarity.");
                break;
            case "crisp":
                // "Crisp" is very short, ensure it's actionable.
                prompt.append(" The email should be extremely brief and to the point, ideally 10-25 words. Focus on conveying the core message directly.");
                break;
            case "default": // Explicitly handling null/default case
            case "appropriate": // Assuming "appropriate" maps to default behavior
            default:
                prompt.append(" The email should be of an appropriate length for the content and context, typically 150-250 words, with a clear and professional structure (2-3 paragraphs).");
                break;
        }

        // --- Output Formatting (Reinforced) ---
        prompt.append("\n\nOutput Format Requirements:\n");
        prompt.append("- Use a single asterisk (*) on a separate line to indicate each new paragraph break. This is the ONLY allowed paragraph separator.\n");
        prompt.append("- Do NOT use any other newlines between paragraphs.\n");
        prompt.append("- Ensure the response does NOT end with an asterisk.\n");
        prompt.append("- Provide ONLY the email content. Do NOT include any introductory phrases (e.g., 'Here's your email:', 'Subject:', 'Body:'), salutations (e.g., 'Dear [Name],'), or closings (e.g., 'Sincerely,'). Start directly with the first word of the email body.\n");
        prompt.append("- Maintain a consistent and professional tone throughout the email.\n");
        prompt.append("Ensure the rewritten text is **properly punctuated**, with all **necessary capital letters**, and correct grammar.");
        return prompt.toString();
    }
}
