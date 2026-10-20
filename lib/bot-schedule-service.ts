import { getCustomAuthUserById, verifyAccessToken } from "@/lib/custom-auth";
import {
  deleteStakeOverride,
  getBotScheduleSlot,
  getOrCreateBotScheduleConfig,
  getStakeOverrideConfig,
  normalizeBotScheduleSlots,
  patchBotScheduleSlot,
  saveBotScheduleConfig,
  saveStakeOverride,
} from "@/lib/bot-schedule";
import { formatCurrentEthiopianTime } from "@/lib/working-hours";

export class BotScheduleServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function requireStaff(authorization?: string) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw new BotScheduleServiceError(401, "Authentication required");
  const user = await getCustomAuthUserById(userId);
  if (!user?.is_staff) throw new BotScheduleServiceError(403, "Staff only");
}

function normalizedPatch(patch: any) {
  return {
    ...(patch.label != null && { label: patch.label }),
    ...(patch.min != null && { min: Number(patch.min) }),
    ...(patch.max != null && { max: Number(patch.max) }),
    ...(patch.mode === "absolute" || patch.mode === "base_plus_extra" ? { mode: patch.mode } : {}),
  };
}

function invalidSlots() {
  return new BotScheduleServiceError(
    400,
    "Invalid slots. Each slot needs id, startMinutes, endMinutes, mode (absolute|base_plus_extra), min, max."
  );
}

export async function getBotSchedule() {
  const { slots, updatedAt } = await getOrCreateBotScheduleConfig();
  const slot = getBotScheduleSlot();
  return {
    slots,
    updatedAt,
    currentEthiopianTime: formatCurrentEthiopianTime(),
    currentSlot: { id: slot.id, label: slot.label, mode: slot.mode, min: slot.min, max: slot.max },
  };
}

export async function updateBotSchedule(authorization: string | undefined, body: any) {
  await requireStaff(authorization);
  if (body.patch?.slotId) {
    const { slots } = await getOrCreateBotScheduleConfig();
    const patched = patchBotScheduleSlot(slots, body.patch.slotId, normalizedPatch(body.patch));
    return saveBotScheduleConfig(patched);
  }
  const normalized = normalizeBotScheduleSlots(body.slots);
  if (!normalized) throw invalidSlots();
  return saveBotScheduleConfig(normalized);
}

export async function getStakeBotSchedule(stake: number) {
  const { slots, hasOverride, updatedAt } = await getStakeOverrideConfig(stake);
  const slot = getBotScheduleSlot(new Date(), slots);
  return {
    stake,
    slots,
    hasOverride,
    updatedAt,
    currentEthiopianTime: formatCurrentEthiopianTime(),
    currentSlot: { id: slot.id, label: slot.label, mode: slot.mode, min: slot.min, max: slot.max },
  };
}

export async function updateStakeBotSchedule(
  authorization: string | undefined,
  stake: number,
  body: any
) {
  await requireStaff(authorization);
  let slots;
  if (body.patch?.slotId) {
    const config = await getStakeOverrideConfig(stake);
    slots = patchBotScheduleSlot(config.slots, body.patch.slotId, normalizedPatch(body.patch));
  } else {
    slots = normalizeBotScheduleSlots(body.slots);
    if (!slots) throw invalidSlots();
  }
  return { ...(await saveStakeOverride(stake, slots)), stake, hasOverride: true };
}

export async function removeStakeBotScheduleOverride(
  authorization: string | undefined,
  stake: number
) {
  await requireStaff(authorization);
  await deleteStakeOverride(stake);
  return { stake, hasOverride: false };
}