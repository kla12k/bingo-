import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** Cap pool size for remote Postgres — avoids exhausting server connection limits. */
function tuneDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? "8");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "30");
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "30");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = tuneDatabaseUrl(process.env.DATABASE_URL);
}

function getPrismaClient(): PrismaClient {
  const client =
    globalForPrisma.prisma ||
    new PrismaClient({
      log: ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

export const prisma = getPrismaClient();

/** Retry once on dead pooled connections (P1017) common with remote Postgres. */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (attempt < retries && (code === "P1017" || code === "P1001" || code === "P2024")) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
