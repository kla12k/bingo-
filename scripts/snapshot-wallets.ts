/**
 * STEP 1: Run this FIRST before applying deductions.
 * Saves a snapshot of all affected user wallets to wallet-snapshot.json
 * so they can be restored instantly if needed.
 *
 * Usage: npx tsx scripts/snapshot-wallets.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// The same user IDs affected by the deduction
const AFFECTED_USER_IDS = [
  5, 6, 7, 10, 11, 13, 14, 16, 18, 19, 20, 21, 22, 26, 27, 28, 29,
  30, 32, 33, 34, 37, 39, 40, 43, 44, 45, 47, 48, 49, 50, 51, 52,
  54, 55, 56, 57, 58, 63, 64, 65, 66, 68, 69, 72, 73, 74, 75, 77,
  78, 80, 81,
];

async function main() {
  console.log("=== SNAPSHOTTING WALLETS BEFORE DEDUCTION ===\n");

  const snapshot: Record<string, { wallet: number; bonus: number }> = {};

  for (const id of AFFECTED_USER_IDS) {
    const user = await prisma.customAuthUser.findUnique({
      where: { abstractuser_ptr_id: BigInt(id) },
      select: { wallet: true, bonus: true },
    });

    if (user) {
      snapshot[String(id)] = {
        wallet: Number(user.wallet),
        bonus: Number(user.bonus),
      };
      console.log(`User ${id}: wallet=${user.wallet}, bonus=${user.bonus}`);
    } else {
      console.log(`User ${id}: NOT FOUND`);
    }
  }

  const outPath = path.join(__dirname, "wallet-snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Snapshot saved to scripts/wallet-snapshot.json`);
  console.log(`   Keep this file safe — it is your rollback data.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
