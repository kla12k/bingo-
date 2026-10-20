/**
 * Cron job: Checks every RandomPlayer wallet and tops up to target if below threshold.
 * Each top-up is logged to random_player_wallet_topup for dashboard net reporting.
 */

import { prisma } from "../lib/prisma";

const WALLET_TOPUP_INTERVAL_MS =
  typeof process.env.WALLET_TOPUP_CRON_INTERVAL_MS === "string"
    ? parseInt(process.env.WALLET_TOPUP_CRON_INTERVAL_MS, 10) || 5 * 60 * 1000
    : 5 * 60 * 1000;

const WALLET_TOPUP_THRESHOLD =
  typeof process.env.WALLET_TOPUP_THRESHOLD === "string"
    ? parseFloat(process.env.WALLET_TOPUP_THRESHOLD) || 2000
    : 2000;

const WALLET_TOPUP_TARGET =
  typeof process.env.WALLET_TOPUP_TARGET === "string"
    ? parseFloat(process.env.WALLET_TOPUP_TARGET) || 50000
    : 50000;

export async function runWalletTopupOnce(): Promise<void> {
  await processWalletTopup();
}

export function startWalletTopupCron(): void {
  const run = async () => {
    try {
      await processWalletTopup();
    } catch (err) {
      console.error("[wallet-topup-cron] error:", err);
    }
  };

  run();
  setInterval(run, WALLET_TOPUP_INTERVAL_MS);

  console.log(
    `[wallet-topup-cron] started, interval=${WALLET_TOPUP_INTERVAL_MS}ms (${WALLET_TOPUP_INTERVAL_MS / 60000}min), threshold=${WALLET_TOPUP_THRESHOLD}, target=${WALLET_TOPUP_TARGET}`
  );
}

async function processWalletTopup(): Promise<void> {
  try {
    const players = await (prisma as any).randomPlayer.findMany({
      orderBy: { id: "asc" },
    });

    if (!players?.length) {
      console.log("[wallet-topup-cron] No RandomPlayer records found");
      return;
    }

    for (const player of players) {
      const balanceBefore = Number(player.wallet ?? 0);
      if (balanceBefore >= WALLET_TOPUP_THRESHOLD) {
        console.log(
          `[wallet-topup-cron] stake=${player.stake} id=${player.id} wallet sufficient (${balanceBefore})`
        );
        continue;
      }

      const topupAmount = WALLET_TOPUP_TARGET - balanceBefore;
      if (topupAmount <= 0) continue;

      await (prisma as any).randomPlayer.update({
        where: { id: player.id },
        data: { wallet: WALLET_TOPUP_TARGET },
      });

      await (prisma as any).randomPlayerWalletTopup.create({
        data: {
          randomPlayerId: player.id,
          stake: Number(player.stake ?? 0),
          balanceBefore,
          balanceAfter: WALLET_TOPUP_TARGET,
          topupAmount,
          reason: "cron_below_threshold",
        },
      });

      console.log(
        `[wallet-topup-cron] stake=${player.stake} id=${player.id} topped up: ${balanceBefore} → ${WALLET_TOPUP_TARGET} (+${topupAmount})`
      );
    }
  } catch (error) {
    console.error("[wallet-topup-cron] Failed to process wallet:", error);
  }
}
