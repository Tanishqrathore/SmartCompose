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

    public boolean isAllowed(String userId, int userPerMinute, int userPerDay) {
        String prefix = "rate_limit:";
        String userPrefix = prefix + userId;
        String globalPrefix = prefix + "global";

        List<String> keys = List.of(
                userPrefix + ":minute_count",
                userPrefix + ":day_count",
                userPrefix + ":minute_ts",
                userPrefix + ":day_ts",
                globalPrefix + ":minute_count",
                globalPrefix + ":day_count",
                globalPrefix + ":minute_ts",
                globalPrefix + ":day_ts"
        );

        List<String> args = List.of(
                String.valueOf(userPerMinute),
                String.valueOf(userPerDay),
                String.valueOf(15),
                String.valueOf(200),
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
