import { getRedis } from "@/lib/redis";
import type Redis from "ioredis";
import { fetchMergedLeaderboard, fetchHumanRank } from "@/lib/leaderboard";

const CACHE_TTL = 1800;
const CACHE_PREFIX = "leaderboard:v3";

async function cacheGet(redis: Redis | null, key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function cacheSet(redis: Redis | null, key: string, value: string, ttl: number) {
  if (!redis) return;
  try {
    await redis.setex(key, ttl, value);
  } catch {}
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, entry) =>
    typeof entry === "bigint" ? entry.toString() : entry
  ));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getLeaderboards(userId: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastWeek = new Date();
  lastWeek.setDate(today.getDate() - 7);
  lastWeek.setHours(0, 0, 0, 0);
  const dailyCacheKey = `${CACHE_PREFIX}:all:daily:${dateKey(today)}`;
  const weeklyCacheKey = `${CACHE_PREFIX}:all:weekly:${dateKey(lastWeek)}`;
  let redis: Redis | null = null;
  try {
    redis = getRedis();
  } catch {}

  const [cachedDaily, cachedWeekly] = await Promise.all([
    cacheGet(redis, dailyCacheKey),
    cacheGet(redis, weeklyCacheKey),
  ]);
  if (cachedDaily && cachedWeekly && !userId) {
    const dailyLeaderboard = JSON.parse(cachedDaily);
    const weeklyLeaderboard = JSON.parse(cachedWeekly);
    return {
      cacheControl: "public, s-maxage=120, stale-while-revalidate=60",
      data: {
        daily_leaderboard: {
          label: "Daily", leaderboard: dailyLeaderboard, your_rank: null,
          total_users_ranked: dailyLeaderboard.length,
          from_date: today.toLocaleDateString(), to_date: new Date().toLocaleDateString(),
        },
        weekly_leaderboard: {
          label: "Weekly", leaderboard: weeklyLeaderboard, your_rank: null,
          total_users_ranked: weeklyLeaderboard.length,
          from_date: lastWeek.toLocaleDateString(), to_date: new Date().toLocaleDateString(),
        },
      },
    };
  }

  const build = async (fromDate: Date, label: string, cacheKey: string) => {
    const cached = await cacheGet(redis, cacheKey);
    const leaderboard = cached
      ? JSON.parse(cached)
      : await fetchMergedLeaderboard(fromDate, 10);
    if (!cached) await cacheSet(redis, cacheKey, JSON.stringify(leaderboard), CACHE_TTL);
    const yourRank = userId ? await fetchHumanRank(userId, fromDate) : null;
    return {
      label,
      leaderboard: jsonSafe(leaderboard),
      your_rank: jsonSafe(yourRank),
      total_users_ranked: leaderboard.length,
      from_date: fromDate.toLocaleDateString(),
      to_date: new Date().toLocaleDateString(),
    };
  };

  const [daily, weekly] = await Promise.all([
    build(today, "Daily", dailyCacheKey),
    build(lastWeek, "Weekly", weeklyCacheKey),
  ]);
  return {
    cacheControl: userId ? "private, max-age=60" : "public, s-maxage=120, stale-while-revalidate=60",
    data: { daily_leaderboard: daily, weekly_leaderboard: weekly },
  };
}