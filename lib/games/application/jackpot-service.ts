import { prisma } from "@/lib/prisma";
import { isValidStake } from "@/lib/stake-config";
import { listJackpotWinHistory } from "@/lib/jackpot-win-log";

const db = prisma as any;

export async function getJackpotSummary(stake: number) {
  if (!(await isValidStake(stake))) throw new Error("Stake is not active");
  const jackpot = await db.jackpot.findUnique({ where: { stake } });
  const amount = jackpot?.amount ?? 0;
  const jackpot_limit = jackpot?.jackpot_limit ?? 0;
  const left = jackpot_limit > 0 ? Math.max(0, jackpot_limit - amount) : 0;
  const { rows } = await listJackpotWinHistory({ stake, page: 1, limit: 1 });
  const lastFromLog = rows[0] ?? null;
  const lastGame = lastFromLog
    ? null
    : await db.game.findFirst({
        where: { stake, jackpotAwarded: { gt: 0 } },
        orderBy: { createdAt: "desc" },
        select: { jackpotAwarded: true, winnerNames: true },
      });

  return {
    stake,
    amount,
    jackpot_limit,
    left,
    leaderName: lastFromLog?.winnerNames?.[0] ?? lastGame?.winnerNames?.[0] ?? null,
    leaderAmount: lastFromLog?.amountAwarded ?? lastGame?.jackpotAwarded ?? 0,
  };
}