/**
 * One-time backfill: refund stakes for historical failed games that never got refund_log rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-failed-game-refunds.ts              # dry-run (preview only)
 *   npx tsx scripts/backfill-failed-game-refunds.ts --apply      # write refunds + credit wallets
 *   npx tsx scripts/backfill-failed-game-refunds.ts --since=2026-07-23 --apply
 *
 * Uses DATABASE_URL from .env (switch .env per brand before running).
 * Skips games that already have refund_log entries or recorded winners (bingo paid out).
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { refundGamePlayersIfNeeded } from "../lib/game-refund";

const BOT_PREFIX = "bot_";

function hasWinners(winner: unknown): boolean {
  return Array.isArray(winner) && winner.length > 0;
}

function previewHumanRefund(stake: number, playerCard: Record<string, number[]>): number {
  let total = 0;
  for (const [userId, cardIds] of Object.entries(playerCard)) {
    if (userId.startsWith(BOT_PREFIX)) continue;
    const n = Array.isArray(cardIds) ? cardIds.length : 0;
    total += stake * n;
  }
  return Math.round(total * 100) / 100;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const sinceArg = process.argv.find((a) => a.startsWith("--since="));
  const since = sinceArg ? new Date(sinceArg.slice("--since=".length)) : null;
  if (sinceArg && since != null && Number.isNaN(since.getTime())) {
    console.error("Invalid --since date. Example: --since=2026-07-23");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL ?? "";
  const dbName = dbUrl.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "unknown";

  console.log(`Database: ${dbName}`);
  console.log(apply ? "Mode: APPLY (will credit wallets)" : "Mode: DRY-RUN (pass --apply to execute)");
  if (since) console.log(`Since: ${since.toISOString()}`);

  const failedGames = await prisma.game.findMany({
    where: {
      status: "failed",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      stake: true,
      playerCard: true,
      winner: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let skippedRefunded = 0;
  let skippedWinners = 0;
  let skippedEmpty = 0;
  let wouldRefundGames = 0;
  let wouldRefundHumans = 0;
  let appliedGames = 0;
  let appliedHumans = 0;

  for (const game of failedGames) {
    const existing = await (prisma as any).refundLog.count({ where: { gameId: game.id } });
    if (existing > 0) {
      skippedRefunded++;
      continue;
    }

    if (hasWinners(game.winner)) {
      skippedWinners++;
      continue;
    }

    const playerCard = (game.playerCard as Record<string, number[]>) ?? {};
    if (Object.keys(playerCard).length === 0) {
      skippedEmpty++;
      continue;
    }

    const humanAmount = previewHumanRefund(Number(game.stake) || 0, playerCard);
    wouldRefundGames++;
    wouldRefundHumans += humanAmount;

    if (!apply) {
      console.log(
        `[dry-run] ${game.createdAt.toISOString()} game=${game.id} stake=${game.stake} human_refund=${humanAmount} ETB`
      );
      continue;
    }

    const credited = await refundGamePlayersIfNeeded(
      game.id,
      Number(game.stake) || 0,
      playerCard,
      "failed_game_backfill"
    );
    if (credited > 0) {
      appliedGames++;
      appliedHumans += credited;
      console.log(`[applied] game=${game.id} credited=${credited} ETB`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Failed games scanned:     ${failedGames.length}`);
  console.log(`Skipped (already refunded): ${skippedRefunded}`);
  console.log(`Skipped (had winners):      ${skippedWinners}`);
  console.log(`Skipped (no players):       ${skippedEmpty}`);
  if (apply) {
    console.log(`Games refunded:           ${appliedGames}`);
    console.log(`Human ETB credited:       ${appliedHumans.toFixed(2)}`);
  } else {
    console.log(`Games to refund:          ${wouldRefundGames}`);
    console.log(`Human ETB to credit:      ${wouldRefundHumans.toFixed(2)}`);
    console.log("\nRun with --apply to execute.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
