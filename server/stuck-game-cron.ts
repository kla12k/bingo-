/**
 * Cron job: finds games stuck in `playing` past STUCK_GAME_SEC and settles them
 * through the shared refund helper, then (optionally) repairs charged games that
 * older builds abandoned as failed/closed without refunding.
 *
 * The pass holds a Redis claim so the in-process interval and the API route
 * (`pages/api/cron/stuck-games.ts`) can never refund the same game twice.
 */

import { prisma } from "../lib/prisma";
import { tryClaim, releaseClaim, renewClaim, STUCK_CRON_CLAIM_KEY } from "../lib/stake-state";
import { settleGameRefundOnce, sweepUnrefundedGames } from "./game-settlement";

const STUCK_GAME_SEC = 400; // same as stake-room

/** Interval in ms - runs every 3 minutes by default, configurable via STUCK_GAME_CRON_INTERVAL_MS */
const CRON_INTERVAL_MS =
  typeof process.env.STUCK_GAME_CRON_INTERVAL_MS === "string"
    ? parseInt(process.env.STUCK_GAME_CRON_INTERVAL_MS, 10) || 3 * 60 * 1000
    : 3 * 60 * 1000;

const CRON_CLAIM_TTL_MS = 2 * 60 * 1000;

/** Refunding historical rounds in bulk is opt-in; otherwise the sweep only reports. */
const SWEEP_ENABLED = process.env.REFUND_SWEEP_ENABLED === "true";

/** Run one pass of stuck-game cleanup (for API cron or manual trigger). */
export async function runStuckGameCronOnce(): Promise<void> {
  await processStuckGames();
}

export function startStuckGameCron(): void {
  const run = async () => {
    try {
      await processStuckGames();
    } catch (err) {
      console.error("[stuck-game-cron] error:", err);
    }
  };

  run(); // run once on startup so DB is checked immediately after restart
  setInterval(run, CRON_INTERVAL_MS);
  console.log(`[stuck-game-cron] started, interval=${CRON_INTERVAL_MS}ms (${CRON_INTERVAL_MS / 60000}min)`);
}

async function processStuckGames(): Promise<void> {
  const token = await tryClaim(STUCK_CRON_CLAIM_KEY, CRON_CLAIM_TTL_MS);
  if (!token) {
    console.log("[stuck-game-cron] another pass is running, skipping");
    return;
  }

  try {
    const cutoff = new Date(Date.now() - STUCK_GAME_SEC * 1000);

    const stuckGames = await (prisma as any).game.findMany({
      where: {
        status: "playing",
        startedAt: { lt: cutoff },
        createdAt: { lt: cutoff },
      },
      select: { id: true, stake: true },
    });

    for (const game of stuckGames) {
      try {
        await renewClaim(STUCK_CRON_CLAIM_KEY, token, CRON_CLAIM_TTL_MS);
        const result = await settleGameRefundOnce(game.id, "stuck_game");
        if (result.settled) {
          console.log(
            `[stuck-game-cron] refunded and cleared stuck game ${game.id} ` +
              `(${result.refundedUsers} player(s), ${result.refundedTotal})`
          );
        }
      } catch (err) {
        console.error(`[stuck-game-cron] failed to process game ${game.id}:`, err);
      }
    }

    await sweepUnrefundedGames({ dryRun: !SWEEP_ENABLED });
  } finally {
    await releaseClaim(STUCK_CRON_CLAIM_KEY, token);
  }
}
