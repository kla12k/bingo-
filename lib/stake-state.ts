import { getRedis } from "./redis";

const redis = getRedis();
const TTL = 60 * 60 * 24; // 24h

export type SelectedPlayer = {
  user: string;
  card: number[];
  confirmedAt?: number;
  displayName?: string;
  playerCode?: string;
};

export function stakeKey(k: string, stake: number): string {
  return `stake:${stake}:${k}`;
}

export function gameStateKey(gameId: string, stateKey: string): string {
  return `game_state:${gameId}:${stateKey}`;
}

export async function getSelectedPlayers(stake: number): Promise<SelectedPlayer[]> {
  const data = await redis.get(stakeKey("selected_players", stake));
  return data ? JSON.parse(data) : [];
}

export async function setSelectedPlayers(stake: number, players: SelectedPlayer[]): Promise<void> {
  await redis.setex(stakeKey("selected_players", stake), TTL, JSON.stringify(players));
}

export async function getPlayerCount(stake: number): Promise<number> {
  const v = await redis.get(stakeKey("player_count", stake));
  return v ? parseInt(v, 10) : 0;
}

export async function setPlayerCount(stake: number, count: number): Promise<void> {
  await redis.setex(stakeKey("player_count", stake), TTL, String(count));
}

export async function getCurrentGameId(stake: number): Promise<string | null> {
  const v = await redis.get(stakeKey("current_game_id", stake));
  return v ? JSON.parse(v) : null;
}

export async function setCurrentGameId(stake: number, gameId: string | null): Promise<void> {
  if (gameId === null) await redis.del(stakeKey("current_game_id", stake));
  else await redis.setex(stakeKey("current_game_id", stake), TTL, JSON.stringify(gameId));
}

export async function getNextGameStart(stake: number): Promise<number | null> {
  const v = await redis.get(stakeKey("next_game_start", stake));
  return v ? parseFloat(v) : null;
}

export async function setNextGameStart(stake: number, timestamp: number | null): Promise<void> {
  if (timestamp === null) await redis.del(stakeKey("next_game_start", stake));
  else await redis.setex(stakeKey("next_game_start", stake), TTL, String(timestamp));
}

/**
 * Hold off starting the next round (e.g. while a winner modal is still on screen),
 * so players who are between rounds never see the next game's calls prematurely.
 */
export async function setStakeStartHold(stake: number, holdMs: number): Promise<void> {
  if (holdMs <= 0) return;
  await redis.set(
    stakeKey("start_hold_until", stake),
    String(Date.now() + holdMs),
    "PX",
    Math.ceil(holdMs)
  );
}

export async function getStakeStartHoldRemainingMs(stake: number): Promise<number> {
  const v = await redis.get(stakeKey("start_hold_until", stake));
  if (!v) return 0;
  return Math.max(0, parseInt(v, 10) - Date.now());
}

export async function clearStakeStartHold(stake: number): Promise<void> {
  await redis.del(stakeKey("start_hold_until", stake));
}

export async function getGameState(gameId: string, stateKey: string): Promise<unknown> {
  const v = await redis.get(gameStateKey(gameId, stateKey));
  return v ? JSON.parse(v) : null;
}

export async function setGameState(
  gameId: string,
  stateKey: string,
  value: unknown
): Promise<void> {
  await redis.setex(gameStateKey(gameId, stateKey), TTL, JSON.stringify(value));
}

/** Delete all Redis state keys for a game (e.g. when closing a stuck game). */
export async function clearGameState(gameId: string): Promise<void> {
  const pattern = `game_state:${gameId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}

// ─── Redis Distributed Lock ───────────────────────────────────────────────────
// Uses Redis SET NX PX which is atomic — safe across multiple server processes.
// Only one confirm_cards can hold the lock for a given stake room at a time.

const LOCK_TTL_MS = 10_000;   // auto-expire after 10s if holder crashes mid-flight
const LOCK_RETRY_MS = 20;     // poll every 20 ms while waiting for the lock
const LOCK_TIMEOUT_MS = 8_000; // give up after 8s and surface an error to the client

export async function acquireStakeLock(stake: number): Promise<string | null> {
  const key = stakeKey("confirm_lock", stake);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // Atomic: SET key token PX ttl NX — only succeeds if key doesn't exist
    const result = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (result === "OK") return token; // we own the lock
    // Someone else holds it — wait briefly then retry
    await new Promise<void>((r) => setTimeout(r, LOCK_RETRY_MS));
  }
  return null; // could not acquire within timeout
}

export async function releaseStakeLock(stake: number, token: string): Promise<void> {
  const key = stakeKey("confirm_lock", stake);
  // Compare-and-delete via Lua so we never release a lock we don't own
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, token);
}

// ─── Prepare-game lock (countdown + prepareGameAndDeduct) ─────────────────────
// Separate from confirm_cards lock; longer TTL because prepare includes DB writes.

const PREPARE_LOCK_TTL_MS = 60_000;
const PREPARE_LOCK_TIMEOUT_MS = 8_000;

export async function acquirePrepareLock(stake: number): Promise<string | null> {
  const key = stakeKey("prepare_lock", stake);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const deadline = Date.now() + PREPARE_LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await redis.set(key, token, "PX", PREPARE_LOCK_TTL_MS, "NX");
    if (result === "OK") return token;
    await new Promise<void>((r) => setTimeout(r, LOCK_RETRY_MS));
  }
  return null;
}

export async function releasePrepareLock(stake: number, token: string): Promise<void> {
  const key = stakeKey("prepare_lock", stake);
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, token);
}

// ─── Named single-flight claims ───────────────────────────────────────────────
// Non-blocking counterpart to acquireStakeLock: used where a second caller must
// give up rather than queue (charging a lobby, running the refund cron, owning a
// number loop across processes).

const RELEASE_IF_OWNER = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/** Returns a token when the claim was won, null when someone else owns it. */
export async function tryClaim(key: string, ttlMs: number): Promise<string | null> {
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const result = await redis.set(key, token, "PX", Math.max(1, Math.ceil(ttlMs)), "NX");
  return result === "OK" ? token : null;
}

/** True while someone holds this claim (used to stay out of an in-flight charge). */
export async function isClaimed(key: string): Promise<boolean> {
  return (await redis.exists(key)) === 1;
}

export async function releaseClaim(key: string, token: string): Promise<void> {
  await redis.eval(RELEASE_IF_OWNER, 1, key, token);
}

/** Extend a claim we still own (long refunds, slow number loops). */
export async function renewClaim(key: string, token: string, ttlMs: number): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token, String(Math.max(1, Math.ceil(ttlMs))));
  return Number(result) === 1;
}

export const STUCK_CRON_CLAIM_KEY = "cron:stuck_games:lock";

export async function getConsecutiveBotWins(stake: number): Promise<number> {
  const v = await redis.get(stakeKey("consecutive_bot_wins", stake));
  return v ? parseInt(v, 10) : 0;
}

export async function incrementConsecutiveBotWins(stake: number): Promise<number> {
  const key = stakeKey("consecutive_bot_wins", stake);
  const v = await redis.incr(key);
  await redis.expire(key, TTL);
  return v;
}

export async function resetConsecutiveBotWins(stake: number): Promise<void> {
  await redis.del(stakeKey("consecutive_bot_wins", stake));
}


