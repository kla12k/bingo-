import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "./prisma";

const BOT_USER_PREFIX = "bot_";

export type GameRefundReason = "stuck_game" | "failed_game" | "failed_game_backfill";

function hasRecordedWinners(winner: unknown): boolean {
  return Array.isArray(winner) && winner.length > 0;
}

export async function refundGamePlayersIfNeeded(
  gameId: string,
  stake: number,
  playerCard: Record<string, number[]>,
  reason: GameRefundReason
): Promise<number> {
  const entries = Object.entries(playerCard);
  if (entries.length === 0) return 0;

  // Remote DB + multi-player refunds often exceed Prisma's default 5s interactive timeout,
  // which then blocks stake locks / confirm_cards with "Server busy".
  return await prisma.$transaction(async (tx) => {
    // 1. Fast-path: if any refund log already exists for this game, bail out.
    //    This avoids unnecessary DB work in the common case.
    const existingRefunds = await tx.refundLog.count({ where: { gameId } });
    if (existingRefunds > 0) return 0;

    // 2. Fetch game state inside transaction
    const game = await tx.game.findUnique({
      where: { id: gameId },
      select: { status: true, winner: true },
    });

    if (!game) return 0;
    if (game.status === "closed") return 0;
    if (hasRecordedWinners(game.winner)) return 0;

    // 3. Mark game as failed to prevent further status transitions
    await tx.game.updateMany({
      where: { id: gameId, status: { not: "closed" } },
      data: { status: "failed" },
    });

    const rp = await tx.randomPlayer.findFirst({
      where: { stake },
      orderBy: { id: "asc" },
    });

    let totalHumanRefund = 0;
    let totalBotRefund = 0;

    for (const [userId, cardIds] of entries) {
      const cardCount = Array.isArray(cardIds) ? cardIds.length : 0;
      if (cardCount === 0) continue;

      const amountRounded = Math.round(stake * cardCount * 100) / 100;

      // ── Log-first, wallet-second ──────────────────────────────────────────
      // Insert the RefundLog row BEFORE crediting the wallet.
      // The unique DB constraint on (gameId, userId) is the atomic gate:
      // if a concurrent process already inserted a row for this user+game,
      // we'll get a P2002 unique-constraint error here and skip the credit.
      // This prevents any double-refund even if two processes pass the
      // existingRefunds > 0 fast-path check above before either has committed.
      try {
        await tx.refundLog.create({
          data: { gameId, userId, amount: amountRounded, reason },
        });
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "P2002") {
          // Already refunded by a concurrent process — skip wallet credit.
          console.warn(`[game-refund] skipping duplicate for game=${gameId} user=${userId}`);
          continue;
        }
        throw e; // unexpected error — propagate
      }

      // RefundLog row confirmed inserted — now safe to credit the wallet.
      if (userId.startsWith(BOT_USER_PREFIX)) {
        totalBotRefund += amountRounded;
      } else {
        const idNum = BigInt(userId);
        const userExists = await tx.customAuthAbstractuser.findUnique({ where: { id: idNum } });
        if (userExists) {
          await tx.customAuthUser.upsert({
            where: { abstractuser_ptr_id: idNum },
            create: {
              abstractuser_ptr_id: idNum,
              wallet: new Decimal(amountRounded),
              bonus: new Decimal(0),
            },
            update: {
              wallet: { increment: new Decimal(amountRounded) },
            },
          });
          totalHumanRefund += amountRounded;
        }
      }
    }

    if (totalBotRefund > 0 && rp) {
      await tx.randomPlayer.update({
        where: { id: rp.id },
        data: { wallet: { increment: totalBotRefund } },
      });
    }

    if (totalHumanRefund > 0 || totalBotRefund > 0) {
      console.log(
        `[game-refund] ${reason} game ${gameId}: humans=${totalHumanRefund} bots=${totalBotRefund}`
      );
    }

    return totalHumanRefund;
  }, { maxWait: 15_000, timeout: 30_000 });
}
