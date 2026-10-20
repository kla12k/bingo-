import { prisma } from "@/lib/prisma";
import { getCustomAuthUserById, verifyAccessToken } from "@/lib/custom-auth";
import { invalidateStakeCache } from "@/lib/stake-config";
import { isValidStake } from "@/lib/stake-config";
import { setPlayerCount, setSelectedPlayers } from "@/lib/stake-state";

const db = prisma as any;

export class StakeServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function requireStaff(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw new StakeServiceError(401, "Authentication required");
  const user = await getCustomAuthUserById(userId);
  if (!user?.is_staff) throw new StakeServiceError(403, "Staff only");
}

export async function listStakes() {
  return db.stakeConfig.findMany({
    orderBy: [{ sort_order: "asc" }, { amount: "asc" }],
  });
}

export async function createStake(authorization: string | undefined, input: any) {
  await requireStaff(authorization);
  const { amount, has_bonus, bones_min_players, bonus_amount, is_active, sort_order } = input;
  if (amount == null || amount <= 0) {
    throw new StakeServiceError(400, "amount is required and must be positive");
  }

  const created = await db.stakeConfig.create({
    data: {
      amount: Number(amount),
      has_bonus: has_bonus ?? false,
      bones_min_players: bones_min_players ?? 10,
      bonus_amount: bonus_amount ?? 0,
      is_active: is_active ?? true,
      sort_order: sort_order ?? 0,
    },
  });
  invalidateStakeCache();
  return created;
}

export async function updateStake(
  authorization: string | undefined,
  rawId: unknown,
  input: any
) {
  const id = typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
  if (!Number.isFinite(id)) throw new StakeServiceError(400, "Invalid id");
  await requireStaff(authorization);

  const update: Record<string, unknown> = {};
  if (input.amount != null) update.amount = Number(input.amount);
  if (input.has_bonus != null) update.has_bonus = input.has_bonus;
  if (input.bones_min_players != null) update.bones_min_players = input.bones_min_players;
  if (input.bonus_amount != null) update.bonus_amount = input.bonus_amount;
  if (input.is_active != null) update.is_active = input.is_active;
  if (input.sort_order != null) update.sort_order = input.sort_order;

  const updated = await db.stakeConfig.update({ where: { id }, data: update });
  invalidateStakeCache();
  return updated;
}

export async function deleteStake(
  authorization: string | undefined,
  rawId: unknown
) {
  const id = typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
  if (!Number.isFinite(id)) throw new StakeServiceError(400, "Invalid id");
  await requireStaff(authorization);
  await db.stakeConfig.delete({ where: { id } });
  invalidateStakeCache();
}

export async function clearSelectedStakeCards(authorization: string | undefined, rawStake: unknown) {
  await requireStaff(authorization);
  const stake = typeof rawStake === "number" ? rawStake : parseFloat(String(rawStake ?? ""));
  if (!Number.isFinite(stake) || stake <= 0) {
    throw new StakeServiceError(400, "Valid stake (amount) is required");
  }
  if (!(await isValidStake(stake))) {
    throw new StakeServiceError(400, "Stake not configured or inactive");
  }
  await setSelectedPlayers(stake, []);
  await setPlayerCount(stake, 0);
  return { ok: true, message: "Selected cards cleared for stake " + stake };
}