import { prisma } from "./prisma";

const DEFAULT_NUMBER_INTERVAL_MS = 4000;
const DEFAULT_GAME_START_COUNTDOWN_SEC = 30;
const MIN_GAME_START_COUNTDOWN_SEC = 1;
const MAX_GAME_START_COUNTDOWN_SEC = 300;
const DEFAULT_PATTERNS_REQUIRED = 1;
const MAX_PATTERNS_REQUIRED = 14;
const DEFAULT_MAX_CARDS_PER_USER = 5;
const MIN_MAX_CARDS_PER_USER = 1;
const MAX_MAX_CARDS_PER_USER = 20;

/** Short TTL so admin changes apply without restarting the socket process. */
const CACHE_TTL_MS = 5_000;

let patternsCache: { value: number; expiresAt: number } | null = null;
let maxCardsCache: { value: number; expiresAt: number } | null = null;
let countdownCache: { value: number; expiresAt: number } | null = null;
let showAutoSelectCache: { value: boolean; expiresAt: number } | null = null;
let botWinPercentCache: { value: number | null; expiresAt: number } | null = null;

export async function getNumberCallingIntervalMs(): Promise<number> {
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    if (config && config.numberCallingSpeedSec && config.numberCallingSpeedSec > 0) {
      return config.numberCallingSpeedSec * 1000;
    }
  } catch (err) {
    // If table doesn't exist yet or query fails, fall back to default interval
  }
  return DEFAULT_NUMBER_INTERVAL_MS;
}

export async function getGameStartCountdownSec(): Promise<number> {
  const now = Date.now();
  if (countdownCache && countdownCache.expiresAt > now) {
    return countdownCache.value;
  }

  let value = DEFAULT_GAME_START_COUNTDOWN_SEC;
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    const raw = Number(config?.gameStartCountdownSec);
    if (Number.isFinite(raw) && raw > 0) {
      value = Math.max(
        MIN_GAME_START_COUNTDOWN_SEC,
        Math.min(MAX_GAME_START_COUNTDOWN_SEC, Math.floor(raw))
      );
    }
  } catch (err) {
    // Fall back to default countdown seconds on query error or missing row
  }

  countdownCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * How many completed bingo patterns (lines/diags/corners) a stake-room claim needs.
 * Defaults to 1 when the column/table is missing so older DBs keep working.
 */
export async function getPatternsRequired(): Promise<number> {
  const now = Date.now();
  if (patternsCache && patternsCache.expiresAt > now) {
    return patternsCache.value;
  }

  let value = DEFAULT_PATTERNS_REQUIRED;
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    const raw = Number(config?.patternsRequired);
    if (Number.isFinite(raw) && raw >= 1) {
      value = Math.max(1, Math.min(MAX_PATTERNS_REQUIRED, Math.floor(raw)));
    }
  } catch {
    // Column may not exist until migration is applied.
  }

  patternsCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * Max cards a player may confirm in a stake lobby.
 * Defaults to 5 when the column/table is missing so older DBs keep working.
 */
export async function getMaxCardsPerUser(): Promise<number> {
  const now = Date.now();
  if (maxCardsCache && maxCardsCache.expiresAt > now) {
    return maxCardsCache.value;
  }

  let value = DEFAULT_MAX_CARDS_PER_USER;
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    const raw = Number(config?.maxCardsPerUser);
    if (Number.isFinite(raw) && raw >= 1) {
      value = Math.max(
        MIN_MAX_CARDS_PER_USER,
        Math.min(MAX_MAX_CARDS_PER_USER, Math.floor(raw))
      );
    }
  } catch {
    // Column may not exist until migration is applied.
  }

  maxCardsCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/**
 * Whether the play-page Auto toggle is shown.
 * Defaults to true when the column/table is missing so older DBs keep working.
 * When false, clients should hide the control and force manual select (autoBingo off).
 */
export async function getShowAutoSelectButton(): Promise<boolean> {
  const now = Date.now();
  if (showAutoSelectCache && showAutoSelectCache.expiresAt > now) {
    return showAutoSelectCache.value;
  }

  let value = true;
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    if (typeof config?.showAutoSelectButton === "boolean") {
      value = config.showAutoSelectButton;
    }
  } catch {
    // Column may not exist until migration is applied.
  }

  showAutoSelectCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

const MIN_BOT_WIN_PERCENT = 0;
const MAX_BOT_WIN_PERCENT = 100;

/**
 * Chance (0–100) that a mixed bot+human round is forced to a bot win.
 * Returns null when the setting is missing (old DB / Prisma client) so gameplay
 * stays natural instead of silently treating it as 0% (always human).
 */
export async function getBotWinPercent(): Promise<number | null> {
  const now = Date.now();
  if (botWinPercentCache && botWinPercentCache.expiresAt > now) {
    return botWinPercentCache.value;
  }

  let value: number | null = null;
  try {
    const config = await (prisma as any).gameConfig.findUnique({
      where: { id: "default" },
    });
    const raw = config?.botWinPercent;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      value = Math.max(MIN_BOT_WIN_PERCENT, Math.min(MAX_BOT_WIN_PERCENT, Math.floor(raw)));
    }
  } catch {
    value = null;
  }

  botWinPercentCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}
