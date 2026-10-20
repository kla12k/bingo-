/**
 * game-settlement.ts
 *
 * Provides settleGameRefundOnce — a single-flight, per-game refund executor.
 * Uses a Redis claim lock keyed per game so that even if clearOrphanedPlayingGames
 * or the stuck-game cron fires concurrently from multiple server processes,
 * only one process will actually execute the refund for any given game.
 *
 * The underlying refundGamePlayersIfNeeded already guards with a DB transaction
 * + unique-constraint (P2002), but this adds an outer Redis gate to avoid
 * the transaction cost entirely for concurrent callers.
 */

import { prisma } from "../lib/prisma";
import { tryClaim, releaseClaim } from "../lib/stake-state";
import { refundGamePlayersIfNeeded } from "../lib/game-refund";
import type { GameRefundReason } from "../lib/game-refund";
import { creditBotWalletInTx, getMoneySafetySchema } from "../lib/balance";

const GAME_CLAIM_TTL_MS = 90_000; // 90 s — more than enough for a full refund pass

function gameClaimKey(gameId: string): string {
  return `settle:${gameId}:lock`;
}

export interface SettleResult {
  settled: boolean;       // true if this process did the refund
  refundedUsers: number;  // total ETB credited back to humans
  refundedTotal: number;  // total ETB credited back to humans (alias for clarity in logs)
  skipped: boolean;       // true if another process claimed the lock first
}

/**
 * Execute a refund for gameId exactly once across all server processes.
 *
 * - Acquires a Redis claim for this game (non-blocking: if the lock is already
 *   held by another process, returns immediately with { skipped: true }).
 * - Reads playerCard + stake from DB inside the lock.
 * - Delegates the actual wallet credits to refundGamePlayersIfNeeded, which
 *   uses a DB transaction + unique constraint to prevent double-credits even
 *   if the Redis lock is somehow lost (e.g. Redis restart).
 */
export async function settleGameRefundOnce(
  gameId: string,
  reason: GameRefundReason | "orphaned_game"
): Promise<SettleResult> {
  const claimKey = gameClaimKey(gameId);
  const token = await tryClaim(claimKey, GAME_CLAIM_TTL_MS);

  if (!token) {
    console.log(`[settle] game ${gameId} already being settled by another process, skipping`);
    return { settled: false, refundedUsers: 0, refundedTotal: 0, skipped: true };
  }

  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { playerCard: true, stake: true, status: true, winner: true },
    });

    if (!game || !game.playerCard || game.status === "closed") {
      return { settled: false, refundedUsers: 0, refundedTotal: 0, skipped: false };
    }

    const playerCard = game.playerCard as Record<string, number[]>;
    const stake = Number(game.stake) || 0;

    // Map "orphaned_game" to a recognised GameRefundReason
    const refundReason: GameRefundReason =
      reason === "orphaned_game" ? "failed_game" : reason;

    const humanRefundTotal = await refundGamePlayersIfNeeded(
      gameId,
      stake,
      playerCard,
      refundReason
    );

    const playerCount = Object.keys(playerCard).filter(
      (uid) => !uid.startsWith("bot_")
    ).length;

    let botRefundTotal = 0;
    const botUserIds = Object.keys(playerCard).filter((uid) => uid.startsWith("bot_"));
    for (const botUid of botUserIds) {
      const cardCount = (playerCard[botUid] || []).length;
      botRefundTotal += cardCount * stake;
    }

    if (botRefundTotal > 0) {
      const rp = await prisma.randomPlayer.findFirst({
        where: { stake },
        orderBy: { id: "asc" },
      });
      if (rp) {
        try {
          await creditBotWalletInTx(prisma, rp.id, botRefundTotal);
          await prisma.refundLog
            .create({
              data: {
                gameId,
                userId: "bot_pool",
                amount: botRefundTotal,
                reason: refundReason,
              },
            })
            .catch(() => {
              /* ignore unique constraint on duplicate settlement */
            });
          console.log(`[settle] game ${gameId}: refunded bot bankroll ${botRefundTotal} ETB`);
        } catch (err) {
          console.error(`[settle] bot refund error on ${gameId}:`, err);
        }
      }
    }

    if (humanRefundTotal > 0 || botRefundTotal > 0) {
      console.log(
        `[settle] game ${gameId} (${reason}): settled ${playerCount} player(s), ` +
          `human total=${humanRefundTotal} ETB, bot total=${botRefundTotal} ETB`
      );
    }

    return {
      settled: true,
      refundedUsers: playerCount,
      refundedTotal: humanRefundTotal + botRefundTotal,
      skipped: false,
    };
  } finally {
    await releaseClaim(claimKey, token);
  }
}

/**
 * Charged games that older builds abandoned: marked failed/closed with no winner
 * and never refunded. Requires `game.refunded_at`, otherwise there is no safe way
 * to tell an unrefunded abort from one the old cron already handled.
 *
 * Dry-run by default — crediting historical rounds in bulk is an explicit,
 * opt-in operation (`REFUND_SWEEP_ENABLED=true`).
 */
export async function sweepUnrefundedGames(
  opts: { dryRun?: boolean; limit?: number } = {}
): Promise<{ candidates: number; repaired: number }> {
  const dryRun = opts.dryRun !== false;
  const limit = Number(opts.limit ?? 25);
  const schema = await getMoneySafetySchema();
  if (!schema.refundedAt) return { candidates: 0, repaired: 0 };

  let rows: any[] = [];
  try {
    rows = await (prisma as any).$queryRawUnsafe(
      `SELECT g.id
         FROM game g
        WHERE g.refunded_at IS NULL
          AND g.winner IS NULL
          AND g.status IN ('failed', 'closed')
          AND g."playerCard" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM refund_log r WHERE r."gameId" = g.id)
        ORDER BY g."updatedAt" DESC
        LIMIT ${limit}`
    );
  } catch (err) {
    console.error("[settle] sweep query failed:", err);
    return { candidates: 0, repaired: 0 };
  }

  const candidates = rows.length;
  if (candidates === 0) return { candidates: 0, repaired: 0 };

  if (dryRun) {
    console.warn(
      `[settle] ${candidates} charged game(s) look failed/closed with no winner and no refund. ` +
        `Set REFUND_SWEEP_ENABLED=true to refund them. Sample: ` +
        rows.slice(0, 5).map((r) => r.id).join(", ")
    );
    return { candidates, repaired: 0 };
  }

  let repaired = 0;
  for (const row of rows) {
    try {
      const result = await settleGameRefundOnce(String(row.id), "failed_game");
      if (result.settled) repaired += 1;
    } catch (err) {
      console.error(`[settle] sweep failed for game ${row.id}:`, err);
    }
  }
  if (repaired > 0) {
    console.log(`[settle] retro sweep refunded ${repaired} previously abandoned game(s)`);
  }
  return { candidates, repaired };
}
