import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { WeeklyEditionStatus, WeeklyStat } from "./weekly-bingo-types";

export type WeeklyEditionRow = {
  id: string;
  title: string;
  stake: number;
  pattern: number;
  startsAt: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  botCount: number;
  botWallet: number;
  botWalletRemaining: number;
  botNames: unknown;
  botFillHoursBeforeStart: number;
  maxCardsPerUser: number;
  houseCutPercent: number;
  status: string;
  prizePool: number;
  winnerPrice: number;
  winnerUserIds: string[];
  winnerCardIds: number[];
  winnerNames: string[];
  calledNumbers: number[];
  randomNumbers: unknown;
  playerMeta: unknown;
  finishedAt: Date | null;
};

export type WeeklyParticipantRow = {
  id: string;
  editionId: string;
  userId: string | null;
  isBot: boolean;
  botSlot: number | null;
  displayName: string;
  playerCode: string | null;
  cardIds: number[];
  entryFeePaid: number;
  confirmedAt: Date;
};

function parseBotNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => String(n)).filter(Boolean);
}

export async function getEditionById(id: string): Promise<WeeklyEditionRow | null> {
  return prisma.weeklyEdition.findUnique({ where: { id } }) as Promise<WeeklyEditionRow | null>;
}

export async function getCurrentWeeklyEdition(): Promise<WeeklyEditionRow | null> {
  const row = await prisma.weeklyEdition.findFirst({
    where: {
      status: { in: ["open", "locked", "running"] },
    },
    orderBy: { startsAt: "asc" },
  });
  return row as WeeklyEditionRow | null;
}

export async function getLatestFinishedEditions(limit = 5): Promise<WeeklyEditionRow[]> {
  const rows = await prisma.weeklyEdition.findMany({
    where: { status: "finished" },
    orderBy: { finishedAt: "desc" },
    take: limit,
  });
  return rows as WeeklyEditionRow[];
}

export async function getTodaysFinishedEdition(): Promise<WeeklyEditionRow | null> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const row = await prisma.weeklyEdition.findFirst({
    where: {
      status: "finished",
      finishedAt: { gte: startOfDay, lt: endOfDay },
    },
    orderBy: { finishedAt: "desc" },
  });
  return row as WeeklyEditionRow | null;
}

export async function createNextWeeklyEdition(
  finished: WeeklyEditionRow
): Promise<WeeklyEditionRow | null> {
  const nextStart = new Date(finished.startsAt.getTime());
  nextStart.setDate(nextStart.getDate() + 7);

  const existing = await prisma.weeklyEdition.findFirst({
    where: {
      startsAt: nextStart,
      status: { in: ["open", "draft", "locked"] },
    },
  });
  if (existing) return existing as WeeklyEditionRow;

  const regOpens = new Date();
  regOpens.setDate(regOpens.getDate() + 1);
  regOpens.setHours(8, 0, 0, 0);

  const titleDate = nextStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const row = await prisma.weeklyEdition.create({
    data: {
      id: `weekly_${nextStart.getTime()}`,
      title: `Weekly Bingo — ${titleDate}`,
      stake: finished.stake,
      pattern: finished.pattern,
      startsAt: nextStart,
      registrationOpensAt: regOpens,
      registrationClosesAt: nextStart,
      botCount: finished.botCount,
      botWallet: finished.botWallet,
      botWalletRemaining: finished.botWallet,
      botNames: finished.botNames ?? [],
      botFillHoursBeforeStart: finished.botFillHoursBeforeStart,
      maxCardsPerUser: finished.maxCardsPerUser,
      houseCutPercent: finished.houseCutPercent,
      status: "open",
    },
  });
  return row as WeeklyEditionRow;
}

function readWinnerSnapshot(edition: WeeklyEditionRow): {
  winner_card?: number[][];
  winning_numbers?: number[];
  called_numbers?: number[];
} {
  const meta = edition.playerMeta as Record<string, unknown> | null;
  const snap = meta?.__winner__ as
    | { card?: number[][]; winning_numbers?: number[]; called_numbers?: number[] }
    | undefined;
  if (!snap?.card) return {};
  return {
    winner_card: snap.card,
    winning_numbers: snap.winning_numbers ?? [],
    called_numbers: snap.called_numbers ?? edition.calledNumbers ?? [],
  };
}

function editionToWinnerRow(e: WeeklyEditionRow) {
  const snap = readWinnerSnapshot(e);
  return {
    id: e.id,
    edition_id: e.id,
    title: e.title,
    winner_name: e.winnerNames?.[0] ?? "—",
    winner_price: e.winnerPrice,
    winner_card_id: e.winnerCardIds?.[0] ?? 0,
    finished_at: e.finishedAt?.toISOString() ?? "",
    stake: e.stake,
    ...snap,
  };
}

function editionToHistoryRow(e: WeeklyEditionRow) {
  const base = editionToWinnerRow(e);
  return {
    id: base.id,
    title: base.title,
    winner_name: base.winner_name,
    winner_price: base.winner_price,
    winner_card_id: base.winner_card_id,
    finished_at: base.finished_at,
    stake: base.stake,
    winner_card: base.winner_card,
    winning_numbers: base.winning_numbers,
    called_numbers: base.called_numbers,
  };
}

export async function buildWeeklyLobbyExtras(): Promise<{
  todays_winner: WeeklyStat["todays_winner"];
  last_week_winner: WeeklyStat["last_week_winner"];
  recent_history: NonNullable<WeeklyStat["recent_history"]>;
}> {
  const todayEdition = await getTodaysFinishedEdition();
  const recent = await getLatestFinishedEditions(12);

  const todays_winner = todayEdition
    ? {
        ...editionToWinnerRow(todayEdition),
        edition_id: todayEdition.id,
      }
    : null;

  const last_week_winner = recent[0] ? editionToHistoryRow(recent[0]) : null;

  return {
    todays_winner,
    last_week_winner,
    recent_history: recent.map(editionToHistoryRow),
  };
}

export async function listFinishedWeeklyEditions(limit = 20): Promise<WeeklyEditionRow[]> {
  const rows = await prisma.weeklyEdition.findMany({
    where: { status: "finished" },
    orderBy: { finishedAt: "desc" },
    take: limit,
  });
  return rows as WeeklyEditionRow[];
}

export async function listFinishedWeeklyEditionsPaginated(
  page = 1,
  limit = 10
): Promise<{
  rows: WeeklyEditionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const skip = (safePage - 1) * safeLimit;

  const [rows, total] = await Promise.all([
    prisma.weeklyEdition.findMany({
      where: { status: "finished" },
      orderBy: { finishedAt: "desc" },
      skip,
      take: safeLimit,
    }),
    prisma.weeklyEdition.count({ where: { status: "finished" } }),
  ]);

  return {
    rows: rows as WeeklyEditionRow[],
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getParticipants(editionId: string): Promise<WeeklyParticipantRow[]> {
  const rows = await prisma.weeklyParticipant.findMany({
    where: { editionId },
    orderBy: { confirmedAt: "asc" },
  });
  return rows as WeeklyParticipantRow[];
}

export async function getParticipantForUser(
  editionId: string,
  userId: string
): Promise<WeeklyParticipantRow | null> {
  const row = await prisma.weeklyParticipant.findFirst({
    where: { editionId, userId, isBot: false },
  });
  return row as WeeklyParticipantRow | null;
}

export function estimateWinnerPrice(prizePool: number, houseCutPercent: number): number {
  const cut = Math.max(0, Math.min(100, houseCutPercent));
  return Math.round(prizePool * (1 - cut / 100) * 100) / 100;
}

export async function buildWeeklyStat(
  edition: WeeklyEditionRow,
  userId?: string | null
): Promise<WeeklyStat> {
  const participants = await getParticipants(edition.id);
  const totalCards = participants.reduce((s, p) => s + p.cardIds.length, 0);
  const prizePool = participants.reduce((s, p) => s + p.entryFeePaid, 0);
  const taken = participants.flatMap((p) => p.cardIds);

  let myEntry: WeeklyStat["my_entry"] = null;
  if (userId) {
    const mine = participants.find((p) => p.userId === userId && !p.isBot);
    if (mine) {
      myEntry = {
        user_id: userId,
        card_ids: mine.cardIds,
        entry_fee_paid: mine.entryFeePaid,
        display_name: mine.displayName,
      };
    }
  }

  const ms = edition.startsAt.getTime() - Date.now();
  const now = Date.now();
  const regOpen =
    now >= edition.registrationOpensAt.getTime() &&
    now <= edition.registrationClosesAt.getTime();
  const regMs = edition.registrationOpensAt.getTime() - now;

  const visibleParticipants = regOpen
    ? participants
    : participants.filter((p) => !p.isBot);
  const visibleCards = visibleParticipants.reduce((s, p) => s + p.cardIds.length, 0);
  const visibleTaken = regOpen ? taken : visibleParticipants.flatMap((p) => p.cardIds);
  const visiblePool = visibleParticipants.reduce((s, p) => s + p.entryFeePaid, 0);

  return {
    edition_id: edition.id,
    title: edition.title,
    stake: edition.stake,
    pattern: edition.pattern,
    status: edition.status as WeeklyEditionStatus,
    starts_at: edition.startsAt.toISOString(),
    registration_opens_at: edition.registrationOpensAt.toISOString(),
    registration_closes_at: edition.registrationClosesAt.toISOString(),
    seconds_until_start: Math.max(0, Math.ceil(ms / 1000)),
    seconds_until_registration: regOpen ? 0 : Math.max(0, Math.ceil(regMs / 1000)),
    registration_open: regOpen,
    participant_count: visibleParticipants.length,
    total_cards: visibleCards,
    prize_pool: Math.round(visiblePool * 100) / 100,
    winner_price_estimate: estimateWinnerPrice(visiblePool, edition.houseCutPercent),
    max_cards_per_user: edition.maxCardsPerUser,
    my_entry: myEntry,
    taken_card_ids: visibleTaken,
  };
}

export async function updateEditionStatus(
  editionId: string,
  status: WeeklyEditionStatus
): Promise<void> {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { status, updatedAt: new Date() },
  });
}

export async function decrementBotWallet(editionId: string, amount: number): Promise<boolean> {
  const edition = await prisma.weeklyEdition.findUnique({ where: { id: editionId } });
  if (!edition || edition.botWalletRemaining < amount) return false;
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { botWalletRemaining: edition.botWalletRemaining - amount },
  });
  return true;
}

export async function creditBotWallet(editionId: string, amount: number): Promise<void> {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { botWalletRemaining: { increment: amount } },
  });
}

export async function insertParticipant(data: {
  editionId: string;
  userId: string | null;
  isBot: boolean;
  botSlot?: number | null;
  displayName: string;
  playerCode?: string | null;
  cardIds: number[];
  entryFeePaid: number;
}): Promise<WeeklyParticipantRow> {
  const row = await prisma.weeklyParticipant.create({
    data: {
      editionId: data.editionId,
      userId: data.userId,
      isBot: data.isBot,
      botSlot: data.botSlot ?? null,
      displayName: data.displayName,
      playerCode: data.playerCode ?? null,
      cardIds: data.cardIds,
      entryFeePaid: data.entryFeePaid,
    },
  });
  return row as WeeklyParticipantRow;
}

const DEFAULT_WEEKLY_BOT_NAMES = [
  "Abebe", "Kebede", "Tigist", "Hanna", "Dawit", "Mimi", "Samuel", "Liya",
  "Yonas", "Sara", "Beki", "Helen", "Jonas", "Ruth", "Mekdes", "Solomon",
  "Eden", "Nati", "Brook", "Rahel", "Daniel", "Marta", "Kaleb", "Selam",
  "Robel", "Betty", "Fikadu", "Meron", "Henok", "Salem", "Abel", "Birtu",
  "Chala", "Dereje", "Elias", "Frehiwot", "Getachew", "Hirut", "Israel", "Jemila",
  "Kidus", "Lulit", "Melaku", "Nardos", "Oliyad", "Paulos", "Rigbe", "Sisay",
  "Tewodros", "Wubet", "Yared", "Zemen", "Almaz", "Binyam", "Desta", "Etenesh",
  "Fitsum", "Genet", "Haile", "Ibssa", "Kalkidan", "Lidya", "Mahlet", "Nebyu",
  "Omar", "Petros", "Saba", "Tamrat", "Usman", "Winta", "Yohannes", "Zerihun",
  "Adane", "Blen", "Chaltu", "Eyerusalem", "Fasika", "Girma", "Hawi", "Kidan",
  "Lomi", "Mekonnen", "Nahom", "Raey", "Semira", "Tadele", "Wondimu", "Yonatan",
  "Aster", "Bereket", "Dagim", "Eyerus", "Fikir", "Gelila", "Hannael", "Iman",
  "Jember", "Kirubel", "Lemlem", "Meseret", "Natnael", "Rediet", "Senait", "Tsion",
  "Amanuel", "Betelhem", "Caleb", "Dagmawi", "Esubalew", "Firehiwot", "Hana", "Iyasu",
  "Liya", "Meklit", "Netsanet", "Rebecca", "Samson", "Yordanos", "Abenezer", "Biruk",
  "Danait", "Eskinder", "Feven", "Hagos", "Kedir", "Lensa", "Mulugeta", "Redwan",
  "Selamawit", "Tilahun", "Zelalem", "Alem", "Beza", "Eskedar", "Gadisa", "Haymanot",
  "Konjit", "Melat", "Netsa", "Addisu", "Belay", "Dina", "Endale", "Fantu",
  "Habtamu", "Kassa", "Mihret", "Nigist", "Seble", "Tesfaye", "Worku", "Yewbdar",
  "Zenebe", "Alemayehu", "Bruk", "Delina", "Emebet", "Getu", "Hasset", "Tewabech",
  "Wondwossen", "Yeshi", "Zewdu", "Alemnesh", "Biniyam", "Dinknesh", "Saron", "Sofonias",
  "Tsega", "Wubit", "Yemane", "Zinash", "Alemseged", "Bezawit", "Chirotaw", "Dagem",
  "Eleni", "Fekadu", "Gashaw", "Hiwot", "Kibru", "Lidet", "Mulu", "Negasi",
  "Rahelita", "Selamaw", "Tigistu", "Wendimu", "Yaredu", "Zekarias", "Amare", "Birtukan",
  "Destawe", "Eskender", "Fikirte", "Getnet", "Haimanot", "Kalkidanu", "Lulita", "Mekdesu",
];

export function botDisplayNameForSlot(edition: WeeklyEditionRow, slot: number): string {
  const names = parseBotNames(edition.botNames);
  const pool = names.length > 0 ? names : DEFAULT_WEEKLY_BOT_NAMES;
  return pool[slot % pool.length] || `Player`;
}

export async function markEditionRunning(
  editionId: string,
  data: {
    prizePool: number;
    winnerPrice: number;
    randomNumbers: number[];
    playerMeta: Record<string, { displayName: string; playerCode: string }>;
  }
): Promise<void> {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: {
      status: "running",
      prizePool: data.prizePool,
      winnerPrice: data.winnerPrice,
      randomNumbers: data.randomNumbers,
      playerMeta: data.playerMeta,
      calledNumbers: [],
      updatedAt: new Date(),
    },
  });
}

export async function markEditionFinished(
  editionId: string,
  data: {
    winnerUserIds: string[];
    winnerCardIds: number[];
    winnerNames: string[];
    calledNumbers: number[];
    winnerSnapshot?: {
      card: number[][];
      winning_numbers: number[];
      called_numbers: number[];
    };
  }
): Promise<void> {
  const edition = await prisma.weeklyEdition.findUnique({ where: { id: editionId } });
  const meta = { ...((edition?.playerMeta as Record<string, unknown>) ?? {}) };
  if (data.winnerSnapshot) {
    meta.__winner__ = data.winnerSnapshot;
  }

  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: {
      status: "finished",
      winnerUserIds: data.winnerUserIds,
      winnerCardIds: data.winnerCardIds,
      winnerNames: data.winnerNames,
      calledNumbers: data.calledNumbers,
      playerMeta: meta as Prisma.InputJsonValue,
      finishedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function markEditionCancelled(editionId: string): Promise<void> {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { status: "cancelled", finishedAt: new Date(), updatedAt: new Date() },
  });
}

export async function appendCalledNumbers(editionId: string, called: number[]): Promise<void> {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { calledNumbers: called },
  });
}

export async function findEditionsToStart(): Promise<WeeklyEditionRow[]> {
  const now = new Date();
  const rows = await prisma.weeklyEdition.findMany({
    where: {
      status: { in: ["open", "locked"] },
      startsAt: { lte: now },
    },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  return rows as WeeklyEditionRow[];
}

export async function findOpenEditionsForBots(): Promise<WeeklyEditionRow[]> {
  const now = new Date();
  const rows = await prisma.weeklyEdition.findMany({
    where: {
      status: "open",
      registrationOpensAt: { lte: now },
      registrationClosesAt: { gt: now },
    },
  });
  return rows as WeeklyEditionRow[];
}
