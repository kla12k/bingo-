import { prisma } from "./prisma";

export type StakeConfigItem = {
  amount: number;
  sort_order: number;
  has_bonus: boolean;
  bones_min_players: number;
  bonus_amount: number;
};

export const STAKE_CURRENCY = "birr";

let cachedStakes: StakeConfigItem[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getStakes(): Promise<StakeConfigItem[]> {
  const now = Date.now();
  if (cachedStakes && cacheExpiry > now) {
    return cachedStakes;
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Prisma types not resolved in Next.js Turbopack build
  const rows = await prisma.stakeConfig.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: "asc" }, { amount: "asc" }],
    select: { amount: true, sort_order: true, has_bonus: true, bones_min_players: true, bonus_amount: true },
  });
  const result = rows.map((r: { amount: number; sort_order: number | null; has_bonus: boolean; bones_min_players: number | null; bonus_amount: number | null }) => ({
    amount: r.amount,
    sort_order: r.sort_order ?? 0,
    has_bonus: r.has_bonus,
    bones_min_players: r.bones_min_players ?? 10,
    bonus_amount: r.bonus_amount ?? 0,
  }));
  cachedStakes = result;
  cacheExpiry = now + CACHE_TTL_MS;
  return result;
}

export async function getStakeAmounts(): Promise<number[]> {
  const stakes = await getStakes();
  return stakes.map((s) => s.amount);
}

export async function isValidStake(stake: number): Promise<boolean> {
  const amounts = await getStakeAmounts();
  return amounts.includes(stake);
}

export async function getBonusForStake(stake: number): Promise<boolean> {
  const stakes = await getStakes();
  const config = stakes.find((s) => s.amount === stake);
  return config?.has_bonus ?? false;
}

export async function getBonesMinPlayers(stake: number): Promise<number> {
  const stakes = await getStakes();
  const config = stakes.find((s) => s.amount === stake);
  return config?.bones_min_players ?? 10;
}

export async function getBonusAmount(stake: number): Promise<number> {
  const stakes = await getStakes();
  const config = stakes.find((s) => s.amount === stake);
  return config?.bonus_amount ?? 0;
}

export function invalidateStakeCache(): void {
  cachedStakes = null;
  cacheExpiry = 0;
}
