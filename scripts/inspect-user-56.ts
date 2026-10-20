import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userId = 56;
  console.log(`=== Inspecting User ${userId} ===`);

  // AbstractUser
  const abstractUser = await prisma.customAuthAbstractuser.findUnique({
    where: { id: BigInt(userId) },
    include: { user: true },
  });
  console.log("AbstractUser:", JSON.stringify(abstractUser, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value, 2));

  // Payment Requests
  const payments = await prisma.paymentRequest.findMany({
    where: { user_id: userId.toString() },
    orderBy: { created_at: 'desc' }
  });
  console.log("Payment Requests:", payments);

  // Participations & Games
  const participations = await prisma.userGameParticipation.findMany({
    where: { userId: BigInt(userId) },
    include: { game: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Participations count: ${participations.length}`);
  for (const p of participations) {
    const userCards = p.game.playerCard ? (p.game.playerCard as Record<string, number[]>)[userId.toString()] || [] : [];
    console.log(`  Game ${p.gameId} (Game# ${p.game.gameNumber}): status=${p.game.status}, stake=${p.game.stake}, cardsCount=${userCards.length}, cards=${JSON.stringify(userCards)}, isWinner=${p.isWinner}, amountWon=${p.amountWon}, timesPlayed=${p.timesPlayed}, winnerPrice=${p.game.winnerPrice}`);
  }

  // Refund Log
  const refunds = await prisma.refundLog.findMany({
    where: { userId: userId.toString() },
    orderBy: { createdAt: 'desc' }
  });
  console.log("Refunds:", refunds);

  // Transfers
  const transfersFrom = await prisma.transfer.findMany({ where: { fromUserId: userId.toString() } });
  const transfersTo = await prisma.transfer.findMany({ where: { toUserId: userId.toString() } });
  console.log("Transfers From:", transfersFrom);
  console.log("Transfers To:", transfersTo);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
