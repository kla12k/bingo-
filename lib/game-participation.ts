import { prisma, withDbRetry } from "./prisma";

export type HumanParticipationInput = {
  user_id: string;
  is_winner: boolean;
  amount_won: number;
  times_played: number;
};

export type BotParticipationInput = {
  player_code: string;
  display_name: string;
  is_winner: boolean;
  amount_won: number;
  times_played: number;
};

export async function upsertHumanParticipations(
  gameId: string,
  participations: HumanParticipationInput[]
): Promise<void> {
  for (const p of participations) {
    if (!p.user_id || p.user_id.startsWith("bot_")) continue;
    const userIdBigInt = BigInt(p.user_id);

    const existing = await (prisma as any).userGameParticipation.findUnique({
      where: { userId_gameId: { userId: userIdBigInt, gameId } },
    });

    const incomingWinner = Boolean(p.is_winner);
    const keepExistingWin = Boolean(existing?.isWinner) && !incomingWinner;

    await withDbRetry(() =>
      (prisma as any).userGameParticipation.upsert({
        where: { userId_gameId: { userId: userIdBigInt, gameId } },
        update: {
          isWinner: keepExistingWin ? true : incomingWinner,
          amountWon: keepExistingWin ? Number(existing.amountWon ?? 0) : p.amount_won,
          timesPlayed: p.times_played || 1,
        },
        create: {
          userId: userIdBigInt,
          gameId,
          isWinner: p.is_winner,
          amountWon: p.amount_won,
          timesPlayed: p.times_played || 1,
        },
      })
    );

    if (!existing) {
      await (prisma as any).customAuthUser
        .update({
          where: { abstractuser_ptr_id: userIdBigInt },
          data: { no_of_games_played: { increment: 1 } },
        })
        .catch((err: unknown) => console.error("[participation] increment no_of_games_played", p.user_id, err));
    }
  }
}

export async function upsertBotParticipations(
  gameId: string,
  participations: BotParticipationInput[]
): Promise<void> {
  for (const p of participations) {
    if (!p.player_code || !p.display_name) continue;

    await withDbRetry(() =>
      (prisma as any).botGameParticipation.upsert({
        where: {
          playerCode_gameId: {
            playerCode: String(p.player_code),
            gameId,
          },
        },
        update: {
          displayName: String(p.display_name),
          isWinner: Boolean(p.is_winner),
          amountWon: Number(p.amount_won ?? 0),
          timesPlayed: Number(p.times_played ?? 1),
        },
        create: {
          playerCode: String(p.player_code),
          displayName: String(p.display_name),
          gameId,
          isWinner: Boolean(p.is_winner),
          amountWon: Number(p.amount_won ?? 0),
          timesPlayed: Number(p.times_played ?? 1),
        },
      })
    );
  }
}
