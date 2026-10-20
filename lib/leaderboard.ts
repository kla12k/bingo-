import { prisma } from "./prisma";

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  name: string;
  phone_number: string;
  total_games_played: number;
  is_bot?: boolean;
};

export async function fetchMergedLeaderboard(fromDate: Date, take = 10): Promise<LeaderboardRow[]> {
  const [humanGrouped, botGrouped] = await Promise.all([
    (prisma as any).userGameParticipation.groupBy({
      by: ["userId"],
      where: {
        game: { status: "closed" },
        createdAt: { gte: fromDate },
      },
      _count: { gameId: true },
    }),
    (prisma as any).botGameParticipation.groupBy({
      by: ["playerCode"],
      where: {
        game: { status: "closed" },
        createdAt: { gte: fromDate },
      },
      _count: { gameId: true },
    }),
  ]);

  const userIds = humanGrouped.map((g: { userId: bigint }) => g.userId);
  const users =
    userIds.length > 0
      ? await (prisma as any).customAuthAbstractuser.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, phone_number: true },
        })
      : [];

  const humanRows: LeaderboardRow[] = humanGrouped.map((g: { userId: bigint; _count: { gameId: number } }) => {
    const user = users.find((u: { id: bigint }) => u.id === g.userId);
    return {
      rank: 0,
      user_id: user?.id.toString() || String(g.userId),
      name: user?.name || "Unknown",
      phone_number: user?.phone_number || "",
      total_games_played: g._count.gameId,
      is_bot: false,
    };
  });

  const botCodes = botGrouped.map((g: { playerCode: string }) => g.playerCode);
  const botNames =
    botCodes.length > 0
      ? await (prisma as any).botGameParticipation.findMany({
          where: { playerCode: { in: botCodes } },
          select: { playerCode: true, displayName: true },
          orderBy: { updatedAt: "desc" },
          distinct: ["playerCode"],
        })
      : [];

  const botRows: LeaderboardRow[] = botGrouped.map(
    (g: { playerCode: string; _count: { gameId: number } }) => {
      const row = botNames.find((b: { playerCode: string }) => b.playerCode === g.playerCode);
      return {
        rank: 0,
        user_id: g.playerCode,
        name: row?.displayName || "Player",
        phone_number: "",
        total_games_played: g._count.gameId,
        is_bot: true,
      };
    }
  );

  return [...humanRows, ...botRows]
    .sort((a, b) => b.total_games_played - a.total_games_played)
    .slice(0, take)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function fetchHumanRank(userId: string, fromDate: Date): Promise<LeaderboardRow | null> {
  const userIdBigInt = BigInt(userId);
  const myCount = await (prisma as any).userGameParticipation.count({
    where: {
      userId: userIdBigInt,
      game: { status: "closed" },
      createdAt: { gte: fromDate },
    },
  });
  if (myCount <= 0) return null;

  const merged = await fetchMergedLeaderboard(fromDate, 10_000);
  const mine = merged.find((r) => !r.is_bot && r.user_id === userId);
  if (mine) return mine;

  const better = merged.filter((r) => r.total_games_played > myCount).length;
  const myUser = await (prisma as any).customAuthAbstractuser.findUnique({
    where: { id: userIdBigInt },
    select: { name: true, phone_number: true },
  });

  return {
    rank: better + 1,
    user_id: userId,
    name: myUser?.name || "You",
    phone_number: myUser?.phone_number || "",
    total_games_played: myCount,
    is_bot: false,
  };
}
