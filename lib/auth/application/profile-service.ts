import {
  getCustomAuthUserById,
  toUserPublic,
  updateCustomAuthName,
} from "@/lib/custom-auth";

export class ProfileServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function getPublicProfile(userId: string) {
  const user = await getCustomAuthUserById(userId);
  if (!user) throw new ProfileServiceError(404, "User not found");
  return toUserPublic(user);
}

export async function updatePublicProfile(userId: string, rawName: unknown, required = false) {
  if (typeof rawName !== "string" || !rawName.trim()) {
    throw new ProfileServiceError(400, required ? "Name is required" : "Name cannot be empty");
  }
  await updateCustomAuthName(userId, rawName.trim());
  const user = await getCustomAuthUserById(userId);
  if (!user) throw new ProfileServiceError(404, "User not found");
  return toUserPublic(user);
}