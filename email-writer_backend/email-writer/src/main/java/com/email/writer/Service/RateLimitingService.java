package com.email.writer.Service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class RateLimitingService {

    @Autowired
    private StringRedisTemplate redisTemplate;

    private final DefaultRedisScript<Long> rateLimitScript;

    public RateLimitingService() {
        this.rateLimitScript = new DefaultRedisScript<>();
        this.rateLimitScript.setLocation(new ClassPathResource("lua/rate.limit.lua"));
        this.rateLimitScript.setResultType(Long.class);
    }

    public boolean isAllowed(String userId, int perMinute, int perDay) {
        List<String> keys = List.of(
                "rate_limit:" + userId + ":minute_count",
                "rate_limit:" + userId + ":day_count",
                "rate_limit:" + userId + ":minute_ts",
                "rate_limit:" + userId + ":day_ts"
        );

        List<String> args = List.of(
                String.valueOf(perMinute),
                String.valueOf(perDay),
                String.valueOf(Instant.now().getEpochSecond())
        );

        Long result = redisTemplate.execute(
                rateLimitScript,
                keys,
                args.toArray(new String[0])
        );

        return result != null && result == 1L;
    }
}
