// @ts-nocheck - Prisma types not resolved in Next.js build
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_STAKES = [
  { amount: 10, has_bonus: true, bones_min_players: 10, bonus_amount: 0, sort_order: 0 },
  { amount: 20, has_bonus: true, bones_min_players: 10, bonus_amount: 0, sort_order: 1 },
  { amount: 30, has_bonus: false, bones_min_players: 10, bonus_amount: 0, sort_order: 2 },
  { amount: 40, has_bonus: false, bones_min_players: 10, bonus_amount: 0, sort_order: 3 },
  { amount: 50, has_bonus: true, bones_min_players: 10, bonus_amount: 0, sort_order: 4 },
  { amount: 100, has_bonus: false, bones_min_players: 10, bonus_amount: 0, sort_order: 5 },
  { amount: 150, has_bonus: false, bones_min_players: 10, bonus_amount: 0, sort_order: 6 },
  { amount: 200, has_bonus: false, bones_min_players: 10, bonus_amount: 0, sort_order: 7 },
];

async function main() {
  const existing = await prisma.stakeConfig.count();
  if (existing > 0) {
    console.log("StakeConfig already seeded, skipping.");
    return;
  }
  for (const s of DEFAULT_STAKES) {
    await prisma.stakeConfig.create({ data: s });
  }
  console.log(`Seeded ${DEFAULT_STAKES.length} stake configs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
