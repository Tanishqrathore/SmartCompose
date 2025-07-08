package com.email.writer.Service;

import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@Data
public class RedisService {

    private static final Duration SESSION_TTL = Duration.ofHours(2); // expire session in 2 hours

    private final StringRedisTemplate redisTemplate;

    @Autowired
    public RedisService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void saveSession(String sessionKey, String email) {
        redisTemplate.opsForValue().set(sessionKey, email, SESSION_TTL);
    }

    public String getEmail(String sessionKey) {
        return redisTemplate.opsForValue().get(sessionKey);
    }

    public Boolean deleteKey(String key) {
        return redisTemplate.delete(key);
    }

    public void saveStyle(String email,String style){
        redisTemplate.opsForValue().set(email,style);
    }

    public String getStyle(String email){
        return redisTemplate.opsForValue().get(email);
    }
}
