import { prisma } from "./prisma";
import { getCurrentGameId, getNextGameStart, getGameState, getPlayerCount } from "./stake-state";
import { getStakes } from "./stake-config";

export type ActiveGameInfo = {
  amount: number;
  sort_order: number;
  is_running: boolean;
  remaining_seconds: number;
  winner_price: number;
  bonus: boolean;
  player_count?: number;
};

export async function getActiveGamesByStake(): Promise<ActiveGameInfo[]> {
  const now = Date.now() / 1000;
  const stakes = await getStakes();
  const out: ActiveGameInfo[] = [];

  for (const config of stakes) {
    const stake = config.amount;
    const currentGameId = await getCurrentGameId(stake);
    const nextStart = await getNextGameStart(stake);
    const isRunning = currentGameId
      ? await getGameState(currentGameId, "is_running")
      : false;
    const hasBonus = config.has_bonus;
    const base = { amount: stake, sort_order: config.sort_order, bonus: hasBonus };

    if (isRunning && currentGameId) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Prisma types not resolved in Next.js Turbopack build
      const game = await prisma.game.findUnique({
        where: { id: currentGameId },
        select: { winnerPrice: true },
      });
      out.push({
        ...base,
        is_running: true,
        remaining_seconds: 0,
        winner_price: game?.winnerPrice ?? 0,
      });
    } else if (nextStart != null && nextStart > now) {
      const count = await getPlayerCount(stake);
      const winnerPrice = count * stake;
      const price =
        winnerPrice >= 100 ? winnerPrice * 0.8 : winnerPrice >= 50 ? winnerPrice * 0.9 : winnerPrice;
      out.push({
        ...base,
        is_running: false,
        remaining_seconds: Math.max(0, Math.ceil(nextStart - now)),
        winner_price: Math.round(price * 100) / 100,
        player_count: count,
      });
    } else {
      const count = await getPlayerCount(stake);
      const winnerPrice = count * stake;
      const price =
        winnerPrice >= 100 ? winnerPrice * 0.8 : winnerPrice >= 50 ? winnerPrice * 0.9 : winnerPrice;
      out.push({
        ...base,
        is_running: false,
        remaining_seconds: 0,
        winner_price: Math.round(price * 100) / 100,
        player_count: count,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.amount - b.amount;
  });
}
