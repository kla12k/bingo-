import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import {
  clearGameState,
  getCurrentGameId,
  getGameState,
  setCurrentGameId,
  setGameState,
  setNextGameStart,
} from "../lib/stake-state";

async function reconcileStaleStakeGameState(stake: number): Promise<boolean> {
  const gameId = await getCurrentGameId(stake);
  if (!gameId) return false;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });

  const isRunningFlag = await getGameState(gameId, "is_running");
  const dbStillPlaying = game?.status === "playing";

  if (dbStillPlaying && isRunningFlag) return false;

  console.log(
    `Clearing stale stake ${stake} game ${gameId} (db=${game?.status ?? "missing"}, redis_running=${isRunningFlag})`
  );
  await setGameState(gameId, "is_running", false);
  await clearGameState(gameId);
  await setCurrentGameId(stake, null);
  await setNextGameStart(stake, null);
  return true;
}

async function main() {
  const stakes = [10, 20, 30, 50];
  for (const stake of stakes) {
    const cleared = await reconcileStaleStakeGameState(stake);
    console.log(`Stake ${stake}: ${cleared ? "cleared" : "ok"}`);
  }
  await prisma.$disconnect();
  await getRedis().quit();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
