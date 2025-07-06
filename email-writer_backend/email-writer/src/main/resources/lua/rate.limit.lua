--[[
Advanced Rate Limiting Script
Supports:
✅ 5 requests/min per user
✅ 200 requests/day per user
✅ 15 requests/min global
✅ 200 requests/day global
✅ TTL cleanup on user keys
✅ No TTL on global keys
✅ Self-initializing global keys
✅ Fully atomic
]]

-- KEYS[1]  = user:minute_count
-- KEYS[2]  = user:day_count
-- KEYS[3]  = user:minute_ts
-- KEYS[4]  = user:day_ts
-- KEYS[5]  = global:minute_count
-- KEYS[6]  = global:day_count
-- KEYS[7]  = global:minute_ts
-- KEYS[8]  = global:day_ts

-- ARGV[1]  = user minute limit (e.g. "5")
-- ARGV[2]  = user daily limit  (e.g. "200")
-- ARGV[3]  = global minute limit (e.g. "15")
-- ARGV[4]  = global daily limit  (e.g. "200")
-- ARGV[5]  = now (current Unix timestamp in seconds)

-- Load keys
local u_min_count_key = KEYS[1]
local u_day_count_key = KEYS[2]
local u_min_ts_key    = KEYS[3]
local u_day_ts_key    = KEYS[4]

local g_min_count_key = KEYS[5]
local g_day_count_key = KEYS[6]
local g_min_ts_key    = KEYS[7]
local g_day_ts_key    = KEYS[8]

-- Load limits
local u_min_limit = tonumber(ARGV[1])
local u_day_limit = tonumber(ARGV[2])
local g_min_limit = tonumber(ARGV[3])
local g_day_limit = tonumber(ARGV[4])
local now         = tonumber(ARGV[5])

-- Window IDs
local curr_min = math.floor(now / 60)
local curr_day = math.floor(now / 86400)

-- ========= GLOBAL INIT ==========

-- Init global minute window
local g_last_min = tonumber(redis.call("get", g_min_ts_key))
if g_last_min == nil then
    redis.call("set", g_min_ts_key, curr_min)
    redis.call("set", g_min_count_key, 0)
    g_last_min = curr_min
end

-- Init global day window
local g_last_day = tonumber(redis.call("get", g_day_ts_key))
if g_last_day == nil then
    redis.call("set", g_day_ts_key, curr_day)
    redis.call("set", g_day_count_key, 0)
    g_last_day = curr_day
end

-- Reset global minute if window changed
if g_last_min ~= curr_min then
    redis.call("set", g_min_ts_key, curr_min)
    redis.call("set", g_min_count_key, 0)
end

-- Reset global day if window changed
if g_last_day ~= curr_day then
    redis.call("set", g_day_ts_key, curr_day)
    redis.call("set", g_day_count_key, 0)
end

-- ========= USER WINDOW ==========

-- Reset user minute if new window
local u_last_min = tonumber(redis.call("get", u_min_ts_key))
if u_last_min == nil or u_last_min ~= curr_min then
    redis.call("set", u_min_ts_key, curr_min)
    redis.call("set", u_min_count_key, 0)
end

-- Reset user day if new window
local u_last_day = tonumber(redis.call("get", u_day_ts_key))
if u_last_day == nil or u_last_day ~= curr_day then
    redis.call("set", u_day_ts_key, curr_day)
    redis.call("set", u_day_count_key, 0)
end

-- ========= COUNT VALUES ==========

-- User counts
local u_min_count = tonumber(redis.call("get", u_min_count_key)) or 0
local u_day_count = tonumber(redis.call("get", u_day_count_key)) or 0

-- Global counts
local g_min_count = tonumber(redis.call("get", g_min_count_key)) or 0
local g_day_count = tonumber(redis.call("get", g_day_count_key)) or 0

-- ========= LIMIT CHECK ==========

if u_min_count >= u_min_limit or u_day_count >= u_day_limit then
    return 0  -- user quota exceeded
end

if g_min_count >= g_min_limit or g_day_count >= g_day_limit then
    return 0  -- global quota exceeded
end

-- ========= INCREMENT COUNTS ==========

redis.call("incr", u_min_count_key)
redis.call("incr", u_day_count_key)
redis.call("incr", g_min_count_key)
redis.call("incr", g_day_count_key)

-- ========= SET TTLs (only for user keys) ==========
--this runs on on each script run: hence expiry times are updated.
redis.call("expire", u_min_count_key, 120)
redis.call("expire", u_min_ts_key, 120)
redis.call("expire", u_day_count_key, 86400)
redis.call("expire", u_day_ts_key, 86400)

-- ========= ALLOW REQUEST ==========
return 1


-- we dont want global keys to expire, also we want user keys to expire after a set time after the last transacted time;
--per minute is set as 120 sec instead of 60 to give some buffer time/
