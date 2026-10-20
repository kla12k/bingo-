import Redis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const db = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0;
const keyPrefix = process.env.REDIS_PARTITION ?? "";

function createRedis(): Redis {
  return new Redis(url, {
    db,
    keyPrefix,
    maxRetriesPerRequest: null,
  });
}

export const redis = createRedis();

export function getRedis(): Redis {
  return redis;
}
