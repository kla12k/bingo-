export const BOT_USER_PREFIX = "bot_";

export type BotIdentity = {
  displayName: string;
  playerCode: string;
};

export type BotPlayerEntry = {
  user: string;
  card: number[];
  confirmedAt?: number;
  displayName?: string;
  playerCode?: string;
};

/** Parse slot index from ids like `bot_10_0` → 0, `bot_10_1` → 1. */
export function parseBotSlotIndex(userId: string): number | null {
  const match = userId.match(/^bot_\d+_(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/** bot_10_0 → names[0], bot_10_1 → names[1], wraps if fewer names than bots. */
export function botDisplayName(userId: string, names: string[]): string {
  const idx = parseBotSlotIndex(userId);
  if (idx == null) return "Player";
  if (names.length === 0) return `Player ${idx + 1}`;
  return String(names[idx % names.length] || `Player ${idx + 1}`);
}

/** Stable synthetic id per bot slot (same bot always gets the same code). */
export function botPlayerCode(userId: string): string {
  const idx = parseBotSlotIndex(userId) ?? 0;
  const stakeMatch = userId.match(/^bot_(\d+)_/);
  const stake = stakeMatch ? parseInt(stakeMatch[1], 10) : 0;
  const code = ((stake * 1000 + idx) * 7919 + 1234567) % 9000000 + 1000000;
  return String(code);
}

export function ensureBotIdentity(
  entry: BotPlayerEntry,
  names: string[]
): BotPlayerEntry & Partial<BotIdentity> {
  if (!entry.user.startsWith(BOT_USER_PREFIX)) return entry;
  return {
    ...entry,
    displayName: entry.displayName ?? botDisplayName(entry.user, names),
    playerCode: entry.playerCode ?? botPlayerCode(entry.user),
  };
}

export function buildPlayerMetaFromSelected(
  selected: BotPlayerEntry[]
): Record<string, { displayName: string; playerCode: string }> {
  const meta: Record<string, { displayName: string; playerCode: string }> = {};
  for (const p of selected) {
    if (!p.user.startsWith(BOT_USER_PREFIX)) continue;
    if (p.displayName && p.playerCode) {
      meta[p.user] = { displayName: p.displayName, playerCode: p.playerCode };
    }
  }
  return meta;
}

export function botNameFromMeta(
  userId: string,
  playerMeta: Record<string, { displayName?: string; playerCode?: string }> | null | undefined,
  names: string[]
): string {
  return playerMeta?.[userId]?.displayName ?? botDisplayName(userId, names);
}
