import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== Fix Duplicate & Invalid Refunds (Human Users) ===`);
  console.log(`Mode: ${isApply ? "APPLY (database will be modified)" : "DRY-RUN (pass --apply to execute changes)"}\n`);

  // 1. Find all duplicate refund log rows for HUMAN users (where userId not starting with 'bot_')
  console.log("Querying database for human duplicate refund rows...");
  const duplicateRows: Array<{ id: string; gameId: string; userId: string; amount: number }> =
    await prisma.$queryRaw`
      SELECT id, "gameId", "userId", amount
      FROM (
        SELECT id, "gameId", "userId", amount,
               ROW_NUMBER() OVER (PARTITION BY "gameId", "userId" ORDER BY "createdAt" ASC) as rn
        FROM refund_log
        WHERE "userId" NOT LIKE 'bot_%'
      ) sub
      WHERE rn > 1;
    `;

  console.log(`Found ${duplicateRows.length} human duplicate refund rows.`);

  const refundIdsToDelete = new Set<string>();
  const userExcessCredits: Record<string, number> = {};

  for (const row of duplicateRows) {
    refundIdsToDelete.add(row.id);
    userExcessCredits[row.userId] = (userExcessCredits[row.userId] || 0) + row.amount;
    console.log(`[Human Duplicate] Game ${row.gameId}, User ID ${row.userId}: Duplicate Refund = ${row.amount} ETB`);
  }

  // 2. Find refunds issued for human users on closed/finished games via SQL
  console.log("\nQuerying database for human refunds on closed/finished games...");
  const closedGameRefunds: Array<{ id: string; gameId: string; userId: string; amount: number }> =
    await prisma.$queryRaw`
      SELECT r.id, r."gameId", r."userId", r.amount
      FROM refund_log r
      JOIN game g ON r."gameId" = g.id
      WHERE (g.status = 'closed' OR g.winner IS NOT NULL)
        AND r."userId" NOT LIKE 'bot_%';
    `;

  console.log(`Found ${closedGameRefunds.length} human refunds on closed/finished games.`);
  for (const ref of closedGameRefunds) {
    if (!refundIdsToDelete.has(ref.id)) {
      refundIdsToDelete.add(ref.id);
      userExcessCredits[ref.userId] = (userExcessCredits[ref.userId] || 0) + ref.amount;
      console.log(`[Closed Game Refund] Game ${ref.gameId} is closed/finished, but has refund for User ID ${ref.userId}: ${ref.amount} ETB`);
    }
  }

  console.log(`\n=== Summary of Excess Credits Per Human User ===`);
  for (const [userId, excess] of Object.entries(userExcessCredits)) {
    const idNum = BigInt(userId);
    const customUser = await prisma.customAuthUser.findUnique({
      where: { abstractuser_ptr_id: idNum },
    });
    const currentWallet = customUser ? Number(customUser.wallet) : 0;
    const newWallet = Math.max(0, currentWallet - excess);
    console.log(`User ID ${userId}: Current Wallet = ${currentWallet} ETB, Excess Refund = ${excess} ETB, Corrected Wallet = ${newWallet} ETB`);
  }

  const deleteIdsArray = Array.from(refundIdsToDelete);
  console.log(`\nTotal RefundLog rows to delete for human users: ${deleteIdsArray.length}`);

  if (isApply) {
    console.log(`\nApplying changes to database...`);
    for (const [userId, excess] of Object.entries(userExcessCredits)) {
      const idNum = BigInt(userId);
      const customUser = await prisma.customAuthUser.findUnique({
        where: { abstractuser_ptr_id: idNum },
      });
      if (customUser) {
        const currentWallet = Number(customUser.wallet);
        const newWallet = Math.max(0, currentWallet - excess);
        await prisma.customAuthUser.update({
          where: { abstractuser_ptr_id: idNum },
          data: { wallet: newWallet },
        });
        console.log(`Updated User ID ${userId} wallet: ${currentWallet} -> ${newWallet} ETB`);
      }
    }

    if (deleteIdsArray.length > 0) {
      const deleted = await prisma.refundLog.deleteMany({
        where: { id: { in: deleteIdsArray } },
      });
      console.log(`Deleted ${deleted.count} duplicate/invalid human RefundLog records.`);
    }
    console.log(`\nDB reconciliation complete!`);
  } else {
    console.log(`\nDRY-RUN completed. No changes made. Pass --apply to execute adjustments.`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
