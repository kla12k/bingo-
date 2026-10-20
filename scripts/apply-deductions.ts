/**
 * STEP 2: Apply wallet deductions for duplicate refund excess amounts.
 * Run snapshot-wallets.ts FIRST before running this.
 *
 * Usage: npx tsx scripts/apply-deductions.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Exact excess refund amounts calculated from the audit (these were the duplicate
// refund amounts erroneously credited to each user's wallet due to the race condition).
const EXCESS_BY_USER: Record<string, number> = {
  "5":  15020,
  "6":  20,
  "7":  1190,
  "10": 9000,
  "11": 4740,
  "13": 6550,
  "14": 500,
  "16": 1900,
  "18": 12180,
  "19": 40,
  "20": 20,
  "21": 4780,
  "22": 3380,
  "26": 16100,
  "27": 790,
  "28": 400,
  "29": 2080,
  "30": 2200,
  "32": 40,
  "33": 2030,
  "34": 170,
  "37": 2260,
  "39": 1770,
  "40": 22890,
  "43": 5160,
  "44": 19440,
  "45": 3860,
  "47": 6130,
  "48": 3310,
  "49": 770,
  "50": 2990,
  "51": 4560,
  "52": 8330,
  "54": 120,
  "55": 110,
  "56": 60,
  "57": 20,
  "58": 650,
  "63": 1980,
  "64": 170,
  "65": 420,
  "66": 60,
  "68": 20710,
  "69": 5460,
  "72": 130,
  "73": 1640,
  "74": 2980,
  "75": 60,
  "77": 620,
  "78": 160,
  "80": 3650,
  "81": 30,
};

async function main() {
  const isDryRun = !process.argv.includes("--apply");
  console.log(`=== APPLY WALLET DEDUCTIONS ===`);
  console.log(`Mode: ${isDryRun ? "DRY-RUN (pass --apply to execute)" : "LIVE APPLY"}\n`);

  let totalDeducted = 0;
  let usersAffected = 0;
  let usersZeroed = 0;

  for (const [userIdStr, excessAmount] of Object.entries(EXCESS_BY_USER)) {
    const userIdBigInt = BigInt(userIdStr);
    const user = await prisma.customAuthUser.findUnique({
      where: { abstractuser_ptr_id: userIdBigInt },
      select: { wallet: true },
    });

    if (!user) {
      console.log(`User ${userIdStr}: NOT FOUND, skipping.`);
      continue;
    }

    const currentWallet = Number(user.wallet);
    // Deduct the excess — clamp at 0 (never go negative)
    const newWallet = Math.max(0, currentWallet - excessAmount);
    const actualDeduction = currentWallet - newWallet;

    if (actualDeduction <= 0) {
      console.log(`User ${userIdStr}: wallet=${currentWallet} ETB, excess=${excessAmount} ETB → already at 0, no change.`);
      continue;
    }

    console.log(`User ${userIdStr}: ${currentWallet} ETB → ${newWallet} ETB (deducting ${actualDeduction} ETB of ${excessAmount} ETB excess)`);

    if (!isDryRun) {
      await prisma.customAuthUser.update({
        where: { abstractuser_ptr_id: userIdBigInt },
        data: { wallet: new Prisma.Decimal(newWallet) },
      });
    }

    totalDeducted += actualDeduction;
    usersAffected++;
    if (newWallet === 0) usersZeroed++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Users affected:  ${usersAffected}`);
  console.log(`Users zeroed:    ${usersZeroed}`);
  console.log(`Total deducted:  ${totalDeducted} ETB`);
  if (isDryRun) {
    console.log(`\nThis was a dry-run. Run with --apply to execute.`);
    console.log(`To revert after applying: npx tsx scripts/revert-deductions.ts`);
  } else {
    console.log(`\n✅ Done. To revert: npx tsx scripts/revert-deductions.ts`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
