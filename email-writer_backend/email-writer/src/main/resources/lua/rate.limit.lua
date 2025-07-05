--[[
Rate Limiting Script

Implements:
- ✅ 5 requests per minute (fixed window)
- ✅ 200 requests per day
- ✅ TTL cleanup on all keys
- ✅ Fully atomic via Redis Lua
]]

-- KEYS[1] = per-minute request count key (e.g. rate_limit:user123:minute_count)
-- KEYS[2] = daily request count key       (e.g. rate_limit:user123:day_count)
-- KEYS[3] = per-minute timestamp key      (e.g. rate_limit:user123:minute_ts)
-- KEYS[4] = daily timestamp key           (e.g. rate_limit:user123:day_ts)

-- ARGV[1] = minute limit (e.g. "5")
-- ARGV[2] = daily limit  (e.g. "200")
-- ARGV[3] = current time in seconds (Unix epoch)

-- Step 1: Load keys and args
local minute_count_key = KEYS[1]
local day_count_key    = KEYS[2]
local minute_ts_key    = KEYS[3]
local day_ts_key       = KEYS[4]

local minute_limit = tonumber(ARGV[1])
local daily_limit  = tonumber(ARGV[2])
local now          = tonumber(ARGV[3])

-- Step 2: Calculate current window IDs
local current_minute = math.floor(now / 60)
local current_day    = math.floor(now / 86400)

-- Step 3: Check if it's a new minute
local last_minute = tonumber(redis.call("get", minute_ts_key))
if last_minute == nil or last_minute ~= current_minute then
    redis.call("set", minute_ts_key, current_minute)
    redis.call("set", minute_count_key, 0)
end

-- Step 4: Check if it's a new day
local last_day = tonumber(redis.call("get", day_ts_key))
if last_day == nil or last_day ~= current_day then
    redis.call("set", day_ts_key, current_day)
    redis.call("set", day_count_key, 0)
end

-- Step 5: Get updated counters
local minute_count = tonumber(redis.call("get", minute_count_key)) or 0
local day_count    = tonumber(redis.call("get", day_count_key)) or 0

-- Step 6: Check if limits exceeded
if minute_count >= minute_limit or day_count >= daily_limit then
    return 0  -- block request
end

-- Step 7: Increment both counts
redis.call("incr", minute_count_key)
redis.call("incr", day_count_key)

-- Step 8: Set TTLs for cleanup
redis.call("expire", minute_count_key, 120)  -- 2-minute buffer
redis.call("expire", minute_ts_key, 120)
redis.call("expire", day_count_key, 86400)   -- 24 hours
redis.call("expire", day_ts_key, 86400)

-- Step 9: Allow the request
return 1
