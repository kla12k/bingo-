export type WeeklyEditionStatus =
  | "draft"
  | "open"
  | "locked"
  | "running"
  | "finished"
  | "cancelled";

export type WeeklyStat = {
  edition_id: string;
  title: string;
  stake: number;
  pattern: number;
  status: WeeklyEditionStatus;
  starts_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  seconds_until_start: number;
  /** Total players (never split into bots vs humans on the client). */
  participant_count: number;
  total_cards: number;
  prize_pool: number;
  winner_price_estimate: number;
  max_cards_per_user: number;
  my_entry?: {
    user_id: string;
    card_ids: number[];
    entry_fee_paid: number;
    display_name: string;
  } | null;
  taken_card_ids: number[];
  /** Seconds until registration opens (0 if already open). */
  seconds_until_registration?: number;
  registration_open?: boolean;
  todays_winner?: {
    edition_id: string;
    title: string;
    winner_name: string;
    winner_price: number;
    winner_card_id: number;
    finished_at: string;
    winner_card?: number[][];
    winning_numbers?: number[];
    called_numbers?: number[];
  } | null;
  last_week_winner?: {
    id: string;
    title: string;
    winner_name: string;
    winner_price: number;
    winner_card_id: number;
    finished_at: string;
    stake: number;
    winner_card?: number[][];
    winning_numbers?: number[];
    called_numbers?: number[];
  } | null;
  recent_history?: {
    id: string;
    title: string;
    winner_name: string;
    winner_price: number;
    winner_card_id: number;
    finished_at: string;
    stake: number;
    winner_card?: number[][];
    winning_numbers?: number[];
    called_numbers?: number[];
  }[];
};

export type WeeklyResultEntry = {
  user_id: string;
  name: string;
  card_id: number;
  amount_won: number;
  message: string;
  winning_numbers?: number[];
  card?: number[][];
};

/** Server-only — never sent to clients. */
export type WeeklyResultEntryInternal = WeeklyResultEntry & {
  is_bot?: boolean;
  internal_user_id?: string;
};

export type WeeklyGameStat = {
  edition_id: string;
  running: boolean;
  called_numbers: number[];
  stake: number;
  pattern: number;
  participant_count: number;
  prize_pool: number;
  winner_price: number;
};

export const WEEKLY_BOT_PREFIX = "wbot_";

export function weeklyBotUserId(editionId: string, slot: number): string {
  return `${WEEKLY_BOT_PREFIX}${editionId}_${slot}`;
}

export function weeklyRoomName(editionId: string): string {
  return `weekly:${editionId}`;
}

export function weeklyPlayRoomName(editionId: string): string {
  return `weekly_play:${editionId}`;
}

export function isWeeklyBotUserId(userId: string): boolean {
  return userId.startsWith(WEEKLY_BOT_PREFIX);
}

/** Client-safe winner payload — no bot flags or internal ids. */
export function toPublicWeeklyResult(entry: WeeklyResultEntryInternal): WeeklyResultEntry {
  return {
    user_id: entry.user_id,
    name: entry.name,
    card_id: entry.card_id,
    amount_won: entry.amount_won,
    message: entry.message,
    winning_numbers: entry.winning_numbers,
    card: entry.card,
  };
}
