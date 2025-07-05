package com.email.writer.Controller;

import com.email.writer.Models.EmailRequest;
import com.email.writer.Service.EmailGeneratorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/email")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EmailGenController {

    private final EmailGeneratorService emailGeneratorService;

    @PostMapping("/subject")
    public ResponseEntity<String> subject(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody EmailRequest emailRequest) {
        String response = emailGeneratorService.generateSubject(authorizationHeader, emailRequest);
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> generateEmail(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody EmailRequest emailRequest) {
        return emailGeneratorService.generateEmailReply(authorizationHeader, emailRequest)
                .map(chunk -> ServerSentEvent.builder(chunk).build());
    }

    @PostMapping(value = "/write", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> writeEmail(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody EmailRequest emailRequest) {
        return emailGeneratorService.generateEmail(authorizationHeader, emailRequest)
                .map(chunk -> ServerSentEvent.builder(chunk).build());
    }

    @PostMapping(value = "/rewrite", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> aiRewrite(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody EmailRequest emailRequest) {
        return emailGeneratorService.generateContent(authorizationHeader, emailRequest)
                .map(chunk -> ServerSentEvent.builder(chunk).build());
    }
}
