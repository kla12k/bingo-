import { prisma } from "@/lib/prisma";
import { getCustomAuthUserById, verifyAccessToken } from "@/lib/custom-auth";
import {
  buildWorkingHoursStatus,
  getOrCreateWorkingHoursConfig,
  isValidHhmm,
} from "@/lib/working-hours";

const db = prisma as any;

export class WorkingHoursServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function getWorkingHours() {
  return buildWorkingHoursStatus(await getOrCreateWorkingHoursConfig());
}

export async function updateWorkingHours(
  authorization: string | undefined,
  input: { startTime?: string; endTime?: string; isActive?: boolean }
) {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw new WorkingHoursServiceError(401, "Authentication required");

  const admin = await getCustomAuthUserById(userId);
  if (!admin?.is_staff) throw new WorkingHoursServiceError(403, "Staff only");
  if (input.startTime != null && !isValidHhmm(input.startTime)) {
    throw new WorkingHoursServiceError(400, "startTime must be HH:mm (24h Ethiopian time)");
  }
  if (input.endTime != null && !isValidHhmm(input.endTime)) {
    throw new WorkingHoursServiceError(400, "endTime must be HH:mm (24h Ethiopian time)");
  }

  const updated = await db.systemWorkingTime.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      startTime: input.startTime ?? "11:00",
      endTime: input.endTime ?? "23:00",
      isActive: input.isActive ?? true,
    },
    update: {
      ...(input.startTime != null && { startTime: input.startTime }),
      ...(input.endTime != null && { endTime: input.endTime }),
      ...(input.isActive != null && { isActive: input.isActive }),
    },
  });

  return buildWorkingHoursStatus({
    startTime: updated.startTime,
    endTime: updated.endTime,
    isActive: updated.isActive,
  });
}