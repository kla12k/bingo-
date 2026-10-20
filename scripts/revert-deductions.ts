/**
 * STEP 3 (emergency rollback): Run this ONLY if you need to revert deductions.
 * Reads wallet-snapshot.json and restores every user back to their pre-deduction amounts.
 *
 * Usage: npx tsx scripts/revert-deductions.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const snapshotPath = path.join(__dirname, "wallet-snapshot.json");

  if (!fs.existsSync(snapshotPath)) {
    console.error("❌ wallet-snapshot.json not found. Did you run snapshot-wallets.ts first?");
    process.exit(1);
  }

  const snapshot: Record<string, { wallet: number; bonus: number }> =
    JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));

  console.log("=== REVERTING WALLET DEDUCTIONS ===\n");
  console.log(`Snapshot loaded from: ${snapshotPath}`);
  console.log(`Users to restore: ${Object.keys(snapshot).length}\n`);

  let restored = 0;
  let skipped = 0;

  for (const [userIdStr, { wallet: originalWallet }] of Object.entries(snapshot)) {
    const userIdBigInt = BigInt(userIdStr);

    const current = await prisma.customAuthUser.findUnique({
      where: { abstractuser_ptr_id: userIdBigInt },
      select: { wallet: true },
    });

    if (!current) {
      console.log(`User ${userIdStr}: NOT FOUND, skipping.`);
      skipped++;
      continue;
    }

    const currentWallet = Number(current.wallet);

    if (currentWallet === originalWallet) {
      console.log(`User ${userIdStr}: already at ${originalWallet} ETB, no change needed.`);
      skipped++;
      continue;
    }

    await prisma.customAuthUser.update({
      where: { abstractuser_ptr_id: userIdBigInt },
      data: { wallet: new Prisma.Decimal(originalWallet) },
    });

    console.log(`User ${userIdStr}: ${currentWallet} -> ${originalWallet} ETB ✅`);
    restored++;
  }

  console.log(`\n=== REVERT COMPLETE ===`);
  console.log(`Restored: ${restored} users`);
  console.log(`Skipped:  ${skipped} users`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
