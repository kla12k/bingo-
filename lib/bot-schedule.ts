import { prisma } from "./prisma";
import { getEthiopianDateParts } from "./working-hours";

/** How bot card target is computed for a time window. */
export type BotCountMode = "absolute" | "base_plus_extra";

export type BotScheduleSlot = {
  id: string;
  label: string;
  /** Inclusive, minutes since midnight (EAT). */
  startMinutes: number;
  /** Exclusive, minutes since midnight (EAT). */
  endMinutes: number;
  mode: BotCountMode;
  min: number;
  max: number;
};

/** Built-in defaults — used when DB row is missing or invalid. */
export const BOT_SCHEDULE_DEFAULTS: BotScheduleSlot[] = [
  {
    id: "late_night",
    label: "00:00–03:00",
    startMinutes: 0,
    endMinutes: 3 * 60,
    mode: "absolute",
    min: 12,
    max: 20,
  },
  {
    id: "early_morning",
    label: "03:00–08:00",
    startMinutes: 3 * 60,
    endMinutes: 8 * 60,
    mode: "absolute",
    min: 5,
    max: 10,
  },
  {
    id: "morning",
    label: "08:00–12:00",
    startMinutes: 8 * 60,
    endMinutes: 12 * 60,
    mode: "absolute",
    min: 5,
    max: 10,
  },
  {
    id: "afternoon",
    label: "12:00–15:00",
    startMinutes: 12 * 60,
    endMinutes: 15 * 60,
    mode: "absolute",
    min: 10,
    max: 15,
  },
  {
    id: "peak",
    label: "15:00–00:00",
    startMinutes: 15 * 60,
    endMinutes: 24 * 60,
    mode: "base_plus_extra",
    min: 1,
    max: 20,
  },
];

/** @deprecated use BOT_SCHEDULE_DEFAULTS */
export const BOT_SCHEDULE_SLOTS = BOT_SCHEDULE_DEFAULTS;

// ── Global (fallback) cache ─────────────────────────────────────────────────
let activeSlots: BotScheduleSlot[] = [...BOT_SCHEDULE_DEFAULTS];

// ── Per-stake override cache ────────────────────────────────────────────────
const stakeOverridesCache = new Map<number, BotScheduleSlot[]>();

function isBotCountMode(value: unknown): value is BotCountMode {
  return value === "absolute" || value === "base_plus_extra";
}

function parseSlot(raw: unknown): BotScheduleSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const startMinutes = Number(o.startMinutes);
  const endMinutes = Number(o.endMinutes);
  const min = Number(o.min);
  const max = Number(o.max);
  if (
    !id ||
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !isBotCountMode(o.mode) ||
    min < 0 ||
    max < min ||
    startMinutes < 0 ||
    endMinutes <= startMinutes ||
    endMinutes > 24 * 60
  ) {
    return null;
  }
  return {
    id,
    label: label || id,
    startMinutes: Math.floor(startMinutes),
    endMinutes: Math.floor(endMinutes),
    mode: o.mode,
    min: Math.floor(min),
    max: Math.floor(max),
  };
}

export function normalizeBotScheduleSlots(raw: unknown): BotScheduleSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed = raw.map(parseSlot).filter((s): s is BotScheduleSlot => s != null);
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => a.startMinutes - b.startMinutes);
  return parsed;
}

// ── Global schedule accessors ───────────────────────────────────────────────

export function getActiveBotScheduleSlots(): BotScheduleSlot[] {
  return activeSlots;
}

export function setActiveBotScheduleSlots(slots: BotScheduleSlot[]): void {
  activeSlots = slots;
}

export async function refreshBotScheduleCache(): Promise<BotScheduleSlot[]> {
  try {
    const row = await (prisma as any).botScheduleConfig.findUnique({ where: { id: 1 } });
    const normalized = normalizeBotScheduleSlots(row?.slots);
    if (normalized) {
      activeSlots = normalized;
      return activeSlots;
    }
  } catch (err) {
    console.error("[bot-schedule] refresh from DB failed, using defaults:", err);
  }
  activeSlots = [...BOT_SCHEDULE_DEFAULTS];
  return activeSlots;
}

export async function getOrCreateBotScheduleConfig(): Promise<{
  slots: BotScheduleSlot[];
  updatedAt: Date | null;
}> {
  const row = await (prisma as any).botScheduleConfig.upsert({
    where: { id: 1 },
    create: { id: 1, slots: BOT_SCHEDULE_DEFAULTS as object[] },
    update: {},
  });
  const normalized = normalizeBotScheduleSlots(row.slots) ?? [...BOT_SCHEDULE_DEFAULTS];
  activeSlots = normalized;
  return { slots: normalized, updatedAt: row.updatedAt ?? null };
}

export async function saveBotScheduleConfig(slots: BotScheduleSlot[]): Promise<{
  slots: BotScheduleSlot[];
  updatedAt: Date;
}> {
  const normalized = normalizeBotScheduleSlots(slots);
  if (!normalized) {
    throw new Error("Invalid bot schedule slots");
  }
  const row = await (prisma as any).botScheduleConfig.upsert({
    where: { id: 1 },
    create: { id: 1, slots: normalized as object[] },
    update: { slots: normalized as object[] },
  });
  activeSlots = normalized;
  return { slots: normalized, updatedAt: row.updatedAt };
}

// ── Per-stake override accessors ────────────────────────────────────────────

/** Returns the override slots for this stake, or null if none set. */
export function getStakeOverrideSlots(stake: number): BotScheduleSlot[] | null {
  return stakeOverridesCache.get(stake) ?? null;
}

/**
 * Returns the effective slots for a stake:
 * stake override if present, otherwise the global schedule.
 */
export function getActiveBotScheduleSlotsForStake(stake: number): BotScheduleSlot[] {
  return stakeOverridesCache.get(stake) ?? activeSlots;
}

/** Refresh the in-memory override cache for a single stake from DB. */
export async function refreshBotScheduleCacheForStake(stake: number): Promise<void> {
  try {
    const row = await (prisma as any).botScheduleStakeOverride.findUnique({ where: { stake } });
    const normalized = normalizeBotScheduleSlots(row?.slots);
    if (normalized) {
      stakeOverridesCache.set(stake, normalized);
    } else {
      stakeOverridesCache.delete(stake);
    }
  } catch (err) {
    console.error(`[bot-schedule] refreshBotScheduleCacheForStake(${stake}) failed:`, err);
  }
}

/** On boot: load all existing per-stake overrides into the cache. */
export async function refreshAllStakeOverrides(): Promise<void> {
  try {
    const rows = await (prisma as any).botScheduleStakeOverride.findMany();
    stakeOverridesCache.clear();
    for (const row of rows) {
      const normalized = normalizeBotScheduleSlots(row.slots);
      if (normalized) stakeOverridesCache.set(row.stake as number, normalized);
    }
    console.log(`[bot-schedule] loaded ${stakeOverridesCache.size} stake override(s)`);
  } catch (err) {
    console.error("[bot-schedule] refreshAllStakeOverrides failed:", err);
  }
}

/** Returns the per-stake override config (falls back to global slots when no override). */
export async function getStakeOverrideConfig(stake: number): Promise<{
  slots: BotScheduleSlot[];
  hasOverride: boolean;
  updatedAt: Date | null;
}> {
  const row = await (prisma as any).botScheduleStakeOverride.findUnique({ where: { stake } });
  if (row) {
    const normalized = normalizeBotScheduleSlots(row.slots) ?? [...BOT_SCHEDULE_DEFAULTS];
    stakeOverridesCache.set(stake, normalized);
    return { slots: normalized, hasOverride: true, updatedAt: row.updatedAt ?? null };
  }
  return { slots: activeSlots, hasOverride: false, updatedAt: null };
}

/** Save a per-stake override. Also updates the in-memory cache. */
export async function saveStakeOverride(
  stake: number,
  slots: BotScheduleSlot[]
): Promise<{ slots: BotScheduleSlot[]; updatedAt: Date }> {
  const normalized = normalizeBotScheduleSlots(slots);
  if (!normalized) throw new Error("Invalid bot schedule slots");
  const row = await (prisma as any).botScheduleStakeOverride.upsert({
    where: { stake },
    create: { stake, slots: normalized as object[] },
    update: { slots: normalized as object[] },
  });
  stakeOverridesCache.set(stake, normalized);
  return { slots: normalized, updatedAt: row.updatedAt };
}

/** Remove a per-stake override (stake reverts to global). */
export async function deleteStakeOverride(stake: number): Promise<void> {
  await (prisma as any).botScheduleStakeOverride.delete({ where: { stake } }).catch(() => {
    // Ignore not-found — already deleted or never existed
  });
  stakeOverridesCache.delete(stake);
}

// ── Slot resolution ─────────────────────────────────────────────────────────

function minutesOfDayEAT(now: Date): number {
  const { hours, minutes } = getEthiopianDateParts(now);
  return hours * 60 + minutes;
}

export function getBotScheduleSlot(now = new Date(), slots = activeSlots): BotScheduleSlot {
  const nowMinutes = minutesOfDayEAT(now);
  for (const slot of slots) {
    if (nowMinutes >= slot.startMinutes && nowMinutes < slot.endMinutes) {
      return slot;
    }
  }
  return slots[slots.length - 1] ?? BOT_SCHEDULE_DEFAULTS[BOT_SCHEDULE_DEFAULTS.length - 1];
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function baseFromRandomPlayer(
  rp: { number_of_players?: number | null } | null,
  defaultBase: number
): number {
  const n = rp?.number_of_players;
  return typeof n === "number" && n > 0 ? Math.floor(n) : defaultBase;
}

/**
 * Roll the bot card target for one lobby round, based on current EAT time.
 * Pass `stake` to use a per-stake override schedule; omit to use the global.
 */
export function rollBotTargetCardCount(
  rp: { number_of_players?: number | null } | null,
  defaultBase: number,
  now = new Date(),
  stake?: number
): number {
  const slots = stake != null ? getActiveBotScheduleSlotsForStake(stake) : activeSlots;
  const slot = getBotScheduleSlot(now, slots);
  if (slot.mode === "base_plus_extra") {
    return baseFromRandomPlayer(rp, defaultBase) + randomInt(slot.min, slot.max);
  }
  return randomInt(slot.min, slot.max);
}

/** Patch one slot by id (e.g. only change afternoon min/max). */
export function patchBotScheduleSlot(
  slots: BotScheduleSlot[],
  slotId: string,
  patch: Partial<Pick<BotScheduleSlot, "label" | "min" | "max" | "mode">>
): BotScheduleSlot[] {
  return slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s));
}
