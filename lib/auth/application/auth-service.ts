import {
  authenticate,
  createUser,
  getCustomAuthUserById,
  getTokensForUser,
  hashPasswordDjango,
  toUserPublic,
  updateCustomAuthPassword,
  verifyPasswordDjango,
  verifyRefreshToken,
} from "@/lib/custom-auth";

export class AuthServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: Record<string, unknown>
  ) {
    super(message);
  }
}

function roleFor(user: any) {
  return user.is_superuser && user.is_staff ? "admin" : user.is_staff ? "agent" : "user";
}

export async function loginUser(input: { phone_number?: string; password?: string }) {
  if (!input.phone_number?.trim() || !input.password) {
    throw new AuthServiceError(400, "Phone number and password are required");
  }
  const user = await authenticate(input.phone_number.trim(), input.password);
  if (!user) throw new AuthServiceError(400, "Invalid phone number or password");
  if (!user.is_verified) {
    throw new AuthServiceError(400, "Not Verified User! Please verify your account.");
  }
  const { access, refresh } = getTokensForUser(user.id);
  return { message: "Login successful", tokens: { access, refresh }, user: { ...toUserPublic(user), role: roleFor(user) } };
}

export async function registerUser(input: { name?: string; phone_number?: string; password?: string }) {
  if (!input.name?.trim() || !input.phone_number?.trim() || !input.password) {
    throw new AuthServiceError(400, "Phone number, name, and password are required");
  }
  if (input.phone_number.replace(/\D/g, "").length < 10) {
    throw new AuthServiceError(400, "Phone number must be at least 10 digits", {
      phone_number: ["Phone number must be at least 10 digits"],
    });
  }
  if (input.password.length < 6) {
    throw new AuthServiceError(400, "Password must be at least 6 characters", {
      password: ["Password must be at least 6 characters"],
    });
  }
  try {
    const user = await createUser({
      phone_number: input.phone_number.trim(),
      name: input.name.trim(),
      password: input.password,
      is_verified: true,
    });
    return { message: "User created successfully", user: toUserPublic(user) };
  } catch (error: any) {
    if (error?.message === "Phone number already in use" || error?.message?.includes("Phone Number")) {
      throw new AuthServiceError(400, error.message);
    }
    throw error;
  }
}

export function refreshUserTokens(rawRefresh: unknown) {
  if (!rawRefresh || typeof rawRefresh !== "string") {
    throw new AuthServiceError(400, "Refresh token is required");
  }
  const userId = verifyRefreshToken(rawRefresh);
  if (!userId) throw new AuthServiceError(401, "Invalid or expired refresh token");
  const { access, refresh } = getTokensForUser(userId);
  return { access, refresh, access_token: access, refresh_token: refresh };
}

export async function changeUserPassword(
  userId: string,
  input: { old_password?: string; new_password?: string; new_password2?: string }
) {
  const { old_password, new_password, new_password2 } = input;
  if (!old_password || !new_password || !new_password2) {
    throw new AuthServiceError(400, "old_password, new_password, and new_password2 are required");
  }
  if (new_password !== new_password2) throw new AuthServiceError(400, "New passwords do not match");
  if (new_password.length < 6) throw new AuthServiceError(400, "Password must be at least 6 characters");
  const user = await getCustomAuthUserById(userId);
  if (!user?.password || !verifyPasswordDjango(old_password, user.password)) {
    throw new AuthServiceError(400, "Old password is incorrect");
  }
  await updateCustomAuthPassword(userId, hashPasswordDjango(new_password));
  return { message: "Password changed successfully" };
}

export async function resetUserPassword(
  adminId: string,
  input: { user_id?: string; new_password?: string; confirm_password?: string }
) {
  const admin = await getCustomAuthUserById(adminId);
  if (!admin?.is_superuser || !admin.is_staff) {
    throw new AuthServiceError(403, "Only admins can reset other users' passwords");
  }
  const { user_id, new_password, confirm_password } = input;
  if (!user_id || !new_password || !confirm_password) {
    throw new AuthServiceError(400, "user_id, new_password, and confirm_password are required");
  }
  if (new_password !== confirm_password) throw new AuthServiceError(400, "Passwords do not match");
  if (user_id === adminId) throw new AuthServiceError(400, "Use /change-password for your own password");
  const user = await getCustomAuthUserById(user_id);
  if (!user) throw new AuthServiceError(404, "User not found");
  await updateCustomAuthPassword(user_id, hashPasswordDjango(new_password));
  const updated = await getCustomAuthUserById(user_id);
  return {
    message: `Password reset successfully for user ${updated?.phone_number ?? user_id}`,
    user: updated ? toUserPublic(updated) : undefined,
  };
}

export async function registerAgent(
  adminId: string,
  input: { phone_number?: string; name?: string; password?: string }
) {
  const admin = await getCustomAuthUserById(adminId);
  if (!admin?.is_superuser || !admin.is_staff) {
    throw new AuthServiceError(403, "Only admins can register agents");
  }
  if (!input.phone_number?.trim() || !input.name?.trim() || !input.password) {
    throw new AuthServiceError(400, "phone_number, name, and password are required");
  }
  try {
    const agent = await createUser({
      phone_number: input.phone_number.trim(),
      name: input.name.trim(),
      password: input.password,
      is_staff: true,
      is_superuser: false,
    });
    return { message: "Agent registered successfully", agent: toUserPublic(agent) };
  } catch (error: any) {
    if (error?.message === "Phone number already in use") {
      throw new AuthServiceError(400, "Phone number already in use");
    }
    throw error;
  }
}

export async function getUserBalance(userId: string) {
  const user = await getCustomAuthUserById(userId);
  if (!user) throw new AuthServiceError(404, "User not found");
  if (!user.is_verified) throw new AuthServiceError(400, "User is not verified");
  return { balance: Number(user.wallet + user.bonus) };
}