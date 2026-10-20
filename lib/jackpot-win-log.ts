import { prisma } from "./prisma";

export type JackpotWinLogRow = {
  id: string;
  gameId: string;
  stake: number;
  jackpotLimit: number;
  poolBefore: number;
  amountAwarded: number;
  contributionFromGame: number;
  winnerUserIds: string[];
  winnerNames: string[];
  winnerCardIds: number[];
  callCount: number | null;
  createdAt: Date;
};

export type RecordJackpotWinInput = {
  gameId: string;
  stake: number;
  jackpotLimit: number;
  poolBefore: number;
  amountAwarded: number;
  contributionFromGame: number;
  winnerUserIds: string[];
  winnerNames: string[];
  winnerCardIds: number[];
  callCount?: number | null;
};

/** Persist a jackpot payout after winners are known. Safe no-op if table missing. */
export async function recordJackpotWin(input: RecordJackpotWinInput): Promise<void> {
  if (input.amountAwarded <= 0) return;

  try {
    await prisma.jackpotWinLog.upsert({
      where: { gameId: input.gameId },
      create: {
        gameId: input.gameId,
        stake: input.stake,
        jackpotLimit: input.jackpotLimit,
        poolBefore: input.poolBefore,
        amountAwarded: input.amountAwarded,
        contributionFromGame: input.contributionFromGame,
        winnerUserIds: input.winnerUserIds,
        winnerNames: input.winnerNames,
        winnerCardIds: input.winnerCardIds,
        callCount: input.callCount ?? null,
      },
      update: {
        winnerUserIds: input.winnerUserIds,
        winnerNames: input.winnerNames,
        winnerCardIds: input.winnerCardIds,
        callCount: input.callCount ?? null,
      },
    });
  } catch (err) {
    console.error("[jackpot-win-log] recordJackpotWin failed:", err);
  }
}

export async function listJackpotWinHistory(opts: {
  stake?: number;
  page?: number;
  limit?: number;
}): Promise<{ rows: JackpotWinLogRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const skip = (page - 1) * limit;

  const where =
    opts.stake != null && Number.isFinite(opts.stake) && opts.stake > 0
      ? { stake: opts.stake }
      : {};

  try {
    const [rows, total] = await Promise.all([
      prisma.jackpotWinLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.jackpotWinLog.count({ where }),
    ]);
    return { rows, total };
  } catch (err) {
    console.error("[jackpot-win-log] listJackpotWinHistory failed:", err);
    return { rows: [], total: 0 };
  }
}
