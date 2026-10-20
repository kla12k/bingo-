import { prisma } from "@/lib/prisma";

const db = prisma as any;
const MAX_HISTORY_GAMES = 100;

function getTotalCalls(game: { xCallCount?: number | null; calledNumbers?: number[] | null }) {
  if (game.xCallCount != null && Number(game.xCallCount) > 0) return Number(game.xCallCount);
  const called = Array.isArray(game.calledNumbers) ? game.calledNumbers : [];
  return called.filter((number) => typeof number === "number" && number !== 0).length;
}

async function getWinnerReferences(winnerIds: string[]): Promise<Record<string, string>> {
  const humanIds = winnerIds
    .filter((id) => id && !String(id).startsWith("bot_"))
    .map((id) => BigInt(id));
  if (!humanIds.length) return {};
  const rows = await db.customAuthUser.findMany({
    where: { abstractuser_ptr_id: { in: humanIds } },
    select: { abstractuser_ptr_id: true, reference: true },
  });
  return rows.reduce((refs: Record<string, string>, row: any) => {
    refs[String(row.abstractuser_ptr_id)] = row.reference || "";
    return refs;
  }, {});
}

function mapRecentGame(game: any, refs: Record<string, string>, userId: string) {
  const winnerIds = Array.isArray(game.winner) ? game.winner.map(String) : [];
  const winnerCards = Array.isArray(game.winnerCards) ? game.winnerCards : [];
  const winnerNames = Array.isArray(game.winnerNames) ? game.winnerNames : [];
  return {
    id: game.id,
    game_id: game.id,
    stake: Number(game.stake),
    played_at: game.startedAt ?? game.createdAt,
    winner_price: Number(game.winnerPrice ?? 0),
    status: game.status,
    is_winner: winnerIds.includes(String(userId)),
    winner_names: winnerNames,
    winner_name: winnerNames[0] || "Unknown",
    winner_reference: refs[winnerIds[0] ?? ""] || null,
    board_number: winnerCards[0] ?? null,
    winner_cards: winnerCards,
    total_calls: getTotalCalls(game),
  };
}

function mapMyGame(participation: any, userId: string, userRef: string | null) {
  const game = participation.game;
  const winnerIds = Array.isArray(game.winner) ? game.winner.map(String) : [];
  const winnerCards = Array.isArray(game.winnerCards) ? game.winnerCards : [];
  const winnerNames = Array.isArray(game.winnerNames) ? game.winnerNames : [];
  const userIdString = String(userId);
  const winnerIndex = winnerIds.findIndex((id: string) => id === userIdString);
  const boardNumber = participation.isWinner && winnerIndex >= 0 && winnerCards[winnerIndex] != null
    ? Number(winnerCards[winnerIndex])
    : null;

  return {
    id: game.id,
    game_id: game.id,
    stake: Number(game.stake),
    times_played: participation.timesPlayed,
    played_at: participation.createdAt,
    winner_price: Number(participation.amountWon ?? 0),
    status: game.status,
    is_winner: Boolean(participation.isWinner),
    winner_names: winnerNames,
    winner_name: participation.isWinner ? winnerNames[winnerIndex] || null : null,
    winner_reference: participation.isWinner ? userRef : null,
    board_number: boardNumber,
    winner_cards: winnerCards,
    total_calls: getTotalCalls(game),
  };
}

const gameSelect = {
  id: true,
  stake: true,
  status: true,
  winner: true,
  winnerNames: true,
  winnerCards: true,
  winnerPrice: true,
  calledNumbers: true,
  xCallCount: true,
  createdAt: true,
  startedAt: true,
};

export async function getGameHistory(
  userId: string,
  query: { type?: string | string[]; filter?: string | string[]; page?: string | string[]; limit?: string | string[] }
) {
  const type = (query.type as string) || "my";
  const filter = (query.filter as string) || "";
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(10, Math.max(1, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  if (skip >= MAX_HISTORY_GAMES) {
    return { history: [], total: MAX_HISTORY_GAMES, count: MAX_HISTORY_GAMES, next: null, prev: page > 1 ? page - 1 : null };
  }
  const take = Math.min(limit, MAX_HISTORY_GAMES - skip);

  if (type === "my") {
    const userIdBigInt = BigInt(userId);
    const where: any = { userId: userIdBigInt, game: { status: "closed" } };
    if (filter === "wins") where.isWinner = true;
    else if (filter === "losses") where.isWinner = false;

    const [participations, rawTotal, user] = await Promise.all([
      db.userGameParticipation.findMany({
        where,
        include: { game: { select: gameSelect } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.userGameParticipation.count({ where }),
      db.customAuthUser.findUnique({
        where: { abstractuser_ptr_id: userIdBigInt },
        select: { reference: true },
      }),
    ]);
    const total = Math.min(rawTotal, MAX_HISTORY_GAMES);
    return {
      history: participations.map((participation: any) => mapMyGame(participation, userId, user?.reference || null)),
      total,
      count: total,
      next: skip + take < total ? page + 1 : null,
      prev: page > 1 ? page - 1 : null,
    };
  }

  const where = { status: "closed" as const };
  const [games, rawTotal] = await Promise.all([
    db.game.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: gameSelect }),
    db.game.count({ where }),
  ]);
  const total = Math.min(rawTotal, MAX_HISTORY_GAMES);
  const winnerIds = games.flatMap((game: any) => Array.isArray(game.winner) ? game.winner.map(String) : []);
  const refs = await getWinnerReferences([...new Set<string>(winnerIds)]);
  return {
    history: games.map((game: any) => mapRecentGame(game, refs, userId)),
    total,
    count: total,
    next: skip + take < total ? page + 1 : null,
    prev: page > 1 ? page - 1 : null,
  };
}

export async function getGameByCode(code: string) {
  return prisma.game.findUnique({
    where: { gameNumber: BigInt(code) },
    include: { players: { select: { id: true, nickname: true } } },
  });
}

export async function getUserGameStats(userId: string) {
  const userIdBigInt = BigInt(userId);
  const [totalWins, totalGames] = await Promise.all([
    db.userGameParticipation.count({ where: { userId: userIdBigInt, isWinner: true } }),
    db.userGameParticipation.count({ where: { userId: userIdBigInt } }),
  ]);
  return { total_wins: totalWins, total_games_played: totalGames };
}