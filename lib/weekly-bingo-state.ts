import { getRedis } from "./redis";

const redis = getRedis();
const TTL = 60 * 60 * 24 * 7;

function key(editionId: string, suffix: string): string {
  return `weekly:${editionId}:${suffix}`;
}

export type WeeklyPendingSelection = {
  socketId: string;
  userId: string;
  cardIds: number[];
  expiresAt: number;
};

const pendingLocal = new Map<string, WeeklyPendingSelection>();

export function setPendingSelection(
  editionId: string,
  socketId: string,
  userId: string,
  cardIds: number[]
): void {
  pendingLocal.set(`${editionId}:${socketId}`, {
    socketId,
    userId,
    cardIds,
    expiresAt: Date.now() + 120_000,
  });
}

export function clearPendingSelection(editionId: string, socketId: string): void {
  pendingLocal.delete(`${editionId}:${socketId}`);
}

export function getPendingForEdition(editionId: string): WeeklyPendingSelection[] {
  const now = Date.now();
  const out: WeeklyPendingSelection[] = [];
  for (const [k, v] of pendingLocal) {
    if (!k.startsWith(`${editionId}:`)) continue;
    if (v.expiresAt < now) {
      pendingLocal.delete(k);
      continue;
    }
    out.push(v);
  }
  return out;
}

export function getPendingCardIdsByOthers(
  editionId: string,
  excludeUserId: string
): Set<number> {
  const set = new Set<number>();
  for (const p of getPendingForEdition(editionId)) {
    if (p.userId === excludeUserId) continue;
    p.cardIds.forEach((id) => set.add(id));
  }
  return set;
}

export async function acquireWeeklyLock(editionId: string): Promise<string | null> {
  const lockKey = key(editionId, "lock");
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const ok = await redis.set(lockKey, token, "PX", 10_000, "NX");
  return ok === "OK" ? token : null;
}

export async function releaseWeeklyLock(editionId: string, token: string): Promise<void> {
  const lockKey = key(editionId, "lock");
  const current = await redis.get(lockKey);
  if (current === token) await redis.del(lockKey);
}

export async function setWeeklyRunningFlag(editionId: string, running: boolean): Promise<void> {
  if (running) {
    await redis.setex(key(editionId, "running"), TTL, "1");
  } else {
    await redis.del(key(editionId, "running"));
  }
}

export async function isWeeklyLoopActive(editionId: string): Promise<boolean> {
  return (await redis.get(key(editionId, "loop_active"))) === "1";
}

export async function setWeeklyLoopActive(editionId: string, active: boolean): Promise<void> {
  if (active) await redis.setex(key(editionId, "loop_active"), TTL, "1");
  else await redis.del(key(editionId, "loop_active"));
}

export async function setWeeklyCalledNumbers(editionId: string, called: number[]): Promise<void> {
  await redis.setex(key(editionId, "called"), TTL, JSON.stringify(called));
}

export async function getWeeklyCalledNumbers(editionId: string): Promise<number[]> {
  const raw = await redis.get(key(editionId, "called"));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function clearAllPendingForSocket(socketId: string): void {
  for (const key of [...pendingLocal.keys()]) {
    if (key.endsWith(`:${socketId}`)) pendingLocal.delete(key);
  }
}
