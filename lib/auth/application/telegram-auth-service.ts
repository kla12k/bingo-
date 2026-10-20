import crypto from "crypto";
import {
  getCustomAuthUserByTelegramId,
  getTokensForUser,
  toUserPublic,
} from "@/lib/custom-auth";

export class TelegramAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function authenticateTelegramInitData(initData: unknown) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData) throw new TelegramAuthError(400, "initData is required");
  if (!botToken) throw new TelegramAuthError(500, "TELEGRAM_BOT_TOKEN not configured");

  const params = new URLSearchParams(String(initData));
  const receivedHash = params.get("hash");
  params.delete("hash");
  if (!receivedHash) throw new TelegramAuthError(400, "Hash not found in initData");

  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculatedHash !== receivedHash) {
    throw new TelegramAuthError(403, "Invalid initData signature", { verified: false });
  }

  const userJson = params.get("user");
  if (!userJson) throw new TelegramAuthError(400, "User data not found in initData");
  const telegramUser = JSON.parse(userJson);
  const user = await getCustomAuthUserByTelegramId(String(telegramUser.id));
  if (!user) throw new TelegramAuthError(404, "User with this telegram_id not found");

  const tokens = getTokensForUser(user.id);
  const role = user.is_superuser && user.is_staff ? "admin" : user.is_staff ? "agent" : "user";
  return { user: { ...toUserPublic(user), role }, tokens };
}