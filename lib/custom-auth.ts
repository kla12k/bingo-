/**
 * Customer management (from apple-bingo custom_auth)
 * Uses custom_auth_abstractuser + custom_auth_user (Django tables). No User model.
 * Password hashing matches Django: PBKDF2-SHA256 (pbkdf2_sha256$iterations$salt$hash).
 * @see apple-bingo-backend/custom_auth/views.py, models.py (User.set_password)
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client/runtime/library";

const PBKDF2_ALGORITHM = "pbkdf2_sha256";
const PBKDF2_ITERATIONS = 260000; // Match Django 4.x default (PBKDF2PasswordHasher.iterations)
const PBKDF2_KEY_LEN = 32; // SHA256 digest size
// Django uses get_random_string(char_count) for salt = plain ASCII alphanumeric, NOT base64 bytes
const DJANGO_RANDOM_STRING_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SALT_CHAR_COUNT = 12; // Django salt_entropy 128 bits with ~6 bits per char -> 12 chars

const LOG_PREFIX = "[AUTH]";

function authLog(message: string, data?: Record<string, unknown>): void {
  if (data !== undefined) {
    console.log(LOG_PREFIX, message, data);
  } else {
    console.log(LOG_PREFIX, message);
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? "bingo-jwt-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";

export type CreateUserInput = {
  phone_number: string;
  name: string;
  password?: string;
  telegram_id?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_verified?: boolean;
  is_affiliate?: boolean;
  is_active?: boolean;
  reference?: string;
};

export type UserPublic = {
  id: string;
  phone_number: string | null;
  name: string;
  telegram_id: string | null;
  date_joined: Date;
  is_verified: boolean;
  is_staff: boolean;
  is_active: boolean;
  is_affiliate: boolean;
  wallet: number;
  bonus: number;
  affiliate_wallet: number | null;
  no_of_cash_deposited: number;
  no_of_games_played: number;
  consecutive_losses: number;
};

/** Normalized user shape from custom_auth (abstractuser + user) for app use */
export type CustomAuthUserRow = {
  id: string;
  name: string;
  phone_number: string;
  telegram_id: string | null;
  is_staff: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  is_active: boolean;
  is_affiliate: boolean;
  date_joined: Date;
  password: string | null;
  wallet: number;
  bonus: number;
  consecutive_losses: number;
  no_of_cash_deposited: number;
  no_of_games_played: number;
  affiliate_wallet: number | null;
  affiliate_reserved_amount: number | null;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "object" && v !== null && "toNumber" in (v as any)) return (v as Decimal).toNumber();
  return Number(v) || 0;
}

/**
 * Hash a password using Django's default: PBKDF2-SHA256.
 * Salt is a plain alphanumeric string (Django get_random_string), not base64.
 * Stored format: pbkdf2_sha256$<iterations>$<salt>$<hash_b64>
 */
export function hashPasswordDjango(password: string): string {
  const saltStr = Array.from(randomBytes(SALT_CHAR_COUNT))
    .map((b) => DJANGO_RANDOM_STRING_CHARS[b % DJANGO_RANDOM_STRING_CHARS.length])
    .join("");
  const salt = Buffer.from(saltStr, "utf8");
  const hash = pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LEN,
    "sha256"
  );
  const hashB64 = hash.toString("base64").replace(/=/g, "");
  return `${PBKDF2_ALGORITHM}$${PBKDF2_ITERATIONS}$${saltStr}$${hashB64}`;
}

/**
 * Verify a password against a Django-style encoded hash.
 * Django stores salt as a plain alphanumeric string (get_random_string), not base64.
 * Only the hash part is base64. Format: pbkdf2_sha256$<iterations>$<salt>$<hash_b64>
 */
export function verifyPasswordDjango(password: string, encoded: string): boolean {
  if (!encoded || !password) return false;
  const parts = encoded.split("$");
  if (parts.length < 4) {
    authLog("verifyPasswordDjango: invalid format (parts.length < 4)", { partsLength: parts.length });
    return false;
  }
  const [algorithm, iterationsStr, saltStr, hashB64] = parts;
  if (algorithm !== PBKDF2_ALGORITHM) {
    authLog("verifyPasswordDjango: unsupported algorithm", { algorithm });
    return false;
  }
  const iterations = parseInt(iterationsStr, 10);
  if (!Number.isInteger(iterations) || iterations < 1) {
    authLog("verifyPasswordDjango: invalid iterations", { iterationsStr });
    return false;
  }
  // Django uses salt as UTF-8 string (get_random_string), not base64-decoded bytes
  const salt = Buffer.from(saltStr, "utf8");
  const expectedHash = Buffer.from(hashB64, "base64");
  const derived = pbkdf2Sync(password, salt, iterations, expectedHash.length, "sha256");
  const valid = derived.length === expectedHash.length && timingSafeEqual(derived, expectedHash);
  authLog("verifyPasswordDjango: compare result", {
    algorithm,
    iterations,
    saltLength: salt.length,
    hashLength: expectedHash.length,
    valid,
  });
  return valid;
}

/** True if string is a numeric custom_auth_abstractuser id (long), not a non-numeric id like "user_xxx". */
function isCustomAuthUserId(userId: string): boolean {
  if (typeof userId !== "string" || !userId) return false;
  return /^\d+$/.test(userId);
}

/** Get user by id (custom_auth_abstractuser.id as numeric string). Returns null if not found or id not numeric. */
export async function getCustomAuthUserById(userId: string): Promise<CustomAuthUserRow | null> {
  if (!isCustomAuthUserId(userId)) return null;
  const id = BigInt(userId);
  const abstract = await (prisma as any).customAuthAbstractuser.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!abstract) return null;
  const ext = abstract.user;
  return {
    id: String(abstract.id),
    name: abstract.name,
    phone_number: abstract.phone_number,
    telegram_id: abstract.telegram_id,
    is_staff: abstract.is_staff,
    is_superuser: abstract.is_superuser,
    is_verified: abstract.is_verified,
    is_active: abstract.is_active,
    is_affiliate: abstract.is_affiliate,
    date_joined: abstract.date_joined,
    password: abstract.password,
    wallet: ext ? toNum(ext.wallet) : 0,
    bonus: ext ? toNum(ext.bonus) : 0,
    consecutive_losses: ext?.consecutive_losses ?? 0,
    no_of_cash_deposited: ext?.no_of_cash_deposited ?? 0,
    no_of_games_played: ext?.no_of_games_played ?? 0,
    affiliate_wallet: ext ? (ext.affiliate_wallet != null ? toNum(ext.affiliate_wallet) : null) : null,
    affiliate_reserved_amount: ext ? (ext.affiliate_reserved_amount != null ? toNum(ext.affiliate_reserved_amount) : null) : null,
  };
}

/** Get user by telegram_id. Returns null if not found. */
export async function getCustomAuthUserByTelegramId(telegramId: string): Promise<CustomAuthUserRow | null> {
  const abstract = await (prisma as any).customAuthAbstractuser.findFirst({
    where: { telegram_id: telegramId },
    include: { user: true },
  });
  if (!abstract) return null;
  const ext = abstract.user;
  return {
    id: String(abstract.id),
    name: abstract.name,
    phone_number: abstract.phone_number,
    telegram_id: abstract.telegram_id,
    is_staff: abstract.is_staff,
    is_superuser: abstract.is_superuser,
    is_verified: abstract.is_verified,
    is_active: abstract.is_active,
    is_affiliate: abstract.is_affiliate,
    date_joined: abstract.date_joined,
    password: abstract.password,
    wallet: ext ? toNum(ext.wallet) : 0,
    bonus: ext ? toNum(ext.bonus) : 0,
    consecutive_losses: ext?.consecutive_losses ?? 0,
    no_of_cash_deposited: ext?.no_of_cash_deposited ?? 0,
    no_of_games_played: ext?.no_of_games_played ?? 0,
    affiliate_wallet: ext ? (ext.affiliate_wallet != null ? toNum(ext.affiliate_wallet) : null) : null,
    affiliate_reserved_amount: ext ? (ext.affiliate_reserved_amount != null ? toNum(ext.affiliate_reserved_amount) : null) : null,
  };
}

/** Update wallet/bonus on custom_auth_user. */
export async function updateCustomAuthUserWalletBonus(
  userId: string,
  data: { wallet?: number; bonus?: number }
): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  const id = BigInt(userId);
  const payload: { wallet?: Decimal; bonus?: Decimal } = {};
  if (typeof data.wallet === "number") payload.wallet = new Decimal(data.wallet);
  if (typeof data.bonus === "number") payload.bonus = new Decimal(data.bonus);
  if (Object.keys(payload).length === 0) return;
  await (prisma as any).customAuthUser.upsert({
    where: { abstractuser_ptr_id: id },
    create: {
      abstractuser_ptr_id: id,
      wallet: new Decimal(data.wallet ?? 0),
      bonus: new Decimal(data.bonus ?? 0),
    },
    update: payload,
  });
}

/** Atomically increment or decrement wallet/bonus on custom_auth_user to prevent race conditions. */
export async function incrementCustomAuthUserWalletBonus(
  userId: string,
  delta: { wallet?: number; bonus?: number }
): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  const id = BigInt(userId);
  const updatePayload: { wallet?: { increment: Decimal }; bonus?: { increment: Decimal } } = {};
  if (typeof delta.wallet === "number" && delta.wallet !== 0) {
    updatePayload.wallet = { increment: new Decimal(delta.wallet) };
  }
  if (typeof delta.bonus === "number" && delta.bonus !== 0) {
    updatePayload.bonus = { increment: new Decimal(delta.bonus) };
  }
  if (Object.keys(updatePayload).length === 0) return;

  await (prisma as any).customAuthUser.upsert({
    where: { abstractuser_ptr_id: id },
    create: {
      abstractuser_ptr_id: id,
      wallet: new Decimal(Math.max(0, delta.wallet ?? 0)),
      bonus: new Decimal(Math.max(0, delta.bonus ?? 0)),
    },
    update: updatePayload,
  });
}


/** Update consecutive_losses (and optional bonus) on custom_auth_user. */
export async function updateCustomAuthUserConsecutiveLosses(
  userId: string,
  data: { consecutive_losses: number; bonus?: number }
): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  const id = BigInt(userId);
  const ext = await (prisma as any).customAuthUser.findUnique({ where: { abstractuser_ptr_id: id } });
  const payload: { consecutive_losses: number; bonus?: Decimal } = { consecutive_losses: data.consecutive_losses };
  if (typeof data.bonus === "number") payload.bonus = new Decimal(data.bonus);
  if (ext) {
    await (prisma as any).customAuthUser.update({
      where: { abstractuser_ptr_id: id },
      data: payload,
    });
  } else {
    await (prisma as any).customAuthUser.create({
      data: {
        abstractuser_ptr_id: id,
        wallet: new Decimal(0),
        bonus: new Decimal(data.bonus ?? 0),
        consecutive_losses: data.consecutive_losses,
      },
    });
  }
}

/** Reset consecutive_losses to 0 for a user. */
export async function resetCustomAuthUserConsecutiveLosses(userId: string): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  const id = BigInt(userId);
  const ext = await (prisma as any).customAuthUser.findUnique({ where: { abstractuser_ptr_id: id } });
  if (ext) {
    await (prisma as any).customAuthUser.update({
      where: { abstractuser_ptr_id: id },
      data: { consecutive_losses: 0 },
    });
  }
}

/** Update password on custom_auth_abstractuser. */
export async function updateCustomAuthPassword(userId: string, hashedPassword: string): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  await (prisma as any).customAuthAbstractuser.update({
    where: { id: BigInt(userId) },
    data: { password: hashedPassword },
  });
}

/** Update name on custom_auth_abstractuser. */
export async function updateCustomAuthName(userId: string, name: string): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  await (prisma as any).customAuthAbstractuser.update({
    where: { id: BigInt(userId) },
    data: { name },
  });
}

/** Update affiliate_reserved_amount on custom_auth_user. */
export async function updateCustomAuthAffiliateReservedAmount(userId: string, affiliateReservedAmount: number, affiliateWallet: number): Promise<void> {
  if (!isCustomAuthUserId(userId)) return;
  await (prisma as any).customAuthUser.update({
    where: { abstractuser_ptr_id: BigInt(userId) },
    data: {
      affiliate_reserved_amount: affiliateReservedAmount,
      affiliate_wallet: affiliateWallet,
    },
  });
}

/** CustomUserManager.create_user equivalent – creates in custom_auth_abstractuser + custom_auth_user */
export async function createUser(input: CreateUserInput) {
  if (!input.phone_number?.trim()) {
    throw new Error("The Phone Number field must be set");
  }
  const existing = await (prisma as any).customAuthAbstractuser.findFirst({
    where: { phone_number: input.phone_number.trim() },
  });
  if (existing) {
    throw new Error("Phone number already in use");
  }
  const hashedPassword = input.password ? hashPasswordDjango(input.password) : "";
  const abstract = await (prisma as any).customAuthAbstractuser.create({
    data: {
      phone_number: input.phone_number.trim(),
      name: input.name?.trim() ?? "User",
      password: hashedPassword,
      date_joined: new Date(),
      telegram_id: input.telegram_id ?? null,
      is_staff: input.is_staff ?? false,
      is_superuser: input.is_superuser ?? false,
      is_verified: input.is_verified ?? false,
      is_affiliate: input.is_affiliate ?? false,
      is_active: input.is_active ?? true,
    },
  });
  await (prisma as any).customAuthUser.create({
    data: {
      abstractuser_ptr_id: abstract.id,
      wallet: new Decimal(0),
      bonus: new Decimal(0),
      reference: input.reference ?? "",
    },
  });
  const created = await getCustomAuthUserById(String(abstract.id));
  if (!created) throw new Error("Failed to load created user");
  return created;
}

/** CustomUserManager.create_superuser equivalent */
export async function createSuperuser(phone_number: string, password: string, name: string) {
  return createUser({
    phone_number,
    password,
    name,
    is_staff: true,
    is_superuser: true,
    is_active: true,
  });
}

/** User.verify_otp equivalent */
export async function verifyOtp(userId: string) {
  if (!isCustomAuthUserId(userId)) return;
  await (prisma as any).customAuthAbstractuser.update({
    where: { id: BigInt(userId) },
    data: { is_verified: true },
  });
}

/** Authenticate by phone_number and password (Django authenticate equivalent) */
export async function authenticate(phone_number: string, password: string): Promise<CustomAuthUserRow | null> {
  const normalizedPhone = phone_number.trim();
  authLog("authenticate: fetching user by phone_number", { phone_number: normalizedPhone });

  const abstract = await (prisma as any).customAuthAbstractuser.findFirst({
    where: { phone_number: normalizedPhone },
    include: { user: true },
  });

  if (!abstract) {
    authLog("authenticate: user not found", { phone_number: normalizedPhone });
    return null;
  }
  authLog("authenticate: user fetched", {
    id: String(abstract.id),
    phone_number: abstract.phone_number,
    hasPassword: !!abstract.password,
    storedAlgorithm: abstract.password ? abstract.password.split("$")[0] ?? null : null,
    is_active: abstract.is_active,
  });

  if (!abstract.password) {
    authLog("authenticate: user has no password set");
    return null;
  }

  authLog("authenticate: comparing password");
  const valid = verifyPasswordDjango(password, abstract.password);
  authLog("authenticate: password compare result", { valid });

  if (!valid) return null;
  if (!abstract.is_active) {
    authLog("authenticate: user is inactive", { id: String(abstract.id) });
    return null;
  }
  return getCustomAuthUserById(String(abstract.id));
}

/** Generate JWT access + refresh tokens. userId = custom_auth_abstractuser.id (string). */
export function getTokensForUser(userId: string) {
  const access = jwt.sign({ sub: String(userId), type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
  const refresh = jwt.sign({ sub: String(userId), type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN } as any);
  return { access, refresh };
}

/** Verify JWT access token and return user id */
export function verifyAccessToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string; type?: string };
    if (decoded?.type === "access" && decoded?.sub) return decoded.sub;
    return null;
  } catch {
    return null;
  }
}

/** Verify JWT refresh token and return user id */
export function verifyRefreshToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub?: string; type?: string };
    if (decoded?.type === "refresh" && decoded?.sub) return decoded.sub;
    return null;
  } catch {
    return null;
  }
}

/** Serialize user for API response (UserSerializer equivalent). Accepts CustomAuthUserRow. */
export function toUserPublic(user: CustomAuthUserRow): UserPublic {
  return {
    id: user.id,
    phone_number: user.phone_number,
    name: user.name,
    telegram_id: user.telegram_id,
    date_joined: user.date_joined,
    is_verified: user.is_verified,
    is_staff: user.is_staff,
    is_active: user.is_active,
    is_affiliate: user.is_affiliate,
    wallet: user.wallet,
    bonus: user.bonus,
    affiliate_wallet: user.affiliate_wallet,
    no_of_cash_deposited: user.no_of_cash_deposited,
    no_of_games_played: user.no_of_games_played,
    consecutive_losses: user.consecutive_losses,
  };
}

// --------------- RandomPlayer helpers ---------------

export type RandomPlayerPublic = {
  id: number;
  on_off: boolean;
  stake: number;
  names: string[];
  wallet: number;
  number_of_players: number;
};

export async function getRandomPlayerByStake(stake: number) {
  return (prisma as any).randomPlayer.findFirst({
    where: { stake },
  });
}

export async function getActiveRandomPlayer(stake: number) {
  return (prisma as any).randomPlayer.findFirst({
    where: { on_off: true, stake },
  });
}

/** Get user game statistics: total games, wins, losses, total won. */
export async function getUserGameStats(userId: string) {
  if (!isCustomAuthUserId(userId)) return null;
  const id = BigInt(userId);

  const participations = await (prisma as any).userGameParticipation.findMany({
    where: { userId: id },
    include: { game: true },
    orderBy: { createdAt: "desc" },
  });

  const totalGames = participations.length;
  const wins = participations.filter((p: any) => p.isWinner).length;
  const losses = totalGames - wins;
  const totalWon = participations.reduce((sum: number, p: any) => sum + (p.amountWon || 0), 0);

  return {
    totalGames,
    wins,
    losses,
    totalWon,
    history: participations.map((p: any) => ({
      gameId: p.gameId,
      date: p.createdAt,
      isWinner: p.isWinner,
      amountWon: p.amountWon,
      stake: p.game?.stake || 0,
    })),
  };
}
