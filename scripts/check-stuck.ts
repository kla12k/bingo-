import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import {
  getCurrentGameId,
  getGameState,
  getNextGameStart,
  getSelectedPlayers,
} from "../lib/stake-state";

async function main() {
  const stake = 10;
  const gameId = await getCurrentGameId(stake);
  const nextStart = await getNextGameStart(stake);
  const selected = await getSelectedPlayers(stake);
  console.log("Redis stake 10:");
  console.log("  current_game_id:", gameId);
  console.log("  next_game_start:", nextStart);
  console.log("  selected_players:", selected.length, "entries");

  if (gameId) {
    const isRunning = await getGameState(gameId, "is_running");
    const called = await getGameState(gameId, "called_numbers");
    console.log("  is_running:", isRunning);
    console.log("  called_numbers:", called);

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, startedAt: true, calledNumbers: true, stake: true },
    });
    console.log("  DB game:", game);
  }

  const playing = await prisma.game.findMany({
    where: { status: "playing" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, stake: true, startedAt: true, createdAt: true },
  });
  console.log("\nPlaying games in DB:", playing);

  const rp = await prisma.randomPlayer.findMany({ orderBy: { id: "asc" } });
  console.log("\nRandomPlayer:", rp);

  await prisma.$disconnect();
  await getRedis().quit();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
