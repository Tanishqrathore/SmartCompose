package com.email.writer.Service;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@Data
public class SessionService {

    private static final Duration SESSION_TTL = Duration.ofHours(2); // expire session in 2 hours

    private final StringRedisTemplate redisTemplate;

    @Autowired
    public SessionService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void saveSession(String sessionKey, String email) {
        redisTemplate.opsForValue().set(sessionKey, email, SESSION_TTL);
    }

    public String getEmail(String sessionKey) {
        return redisTemplate.opsForValue().get(sessionKey);
    }
}
