import { prisma } from "./prisma";

/**
 * Raw-SQL helper to run money operations against either PrismaClient or an
 * active transaction (`tx`), keeping TypeScript happy while using explicit SQL.
 */
function raw(client: unknown): {
  $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<number>;
  $queryRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown>;
} {
  return client as any;
}

export function roundMoney(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function numericLiteral(n: number): string {
  const v = roundMoney(n);
  return Number.isFinite(v) ? String(v) : "0";
}

function newRowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isNumericUserId(userId: string): boolean {
  return typeof userId === "string" && /^\d+$/.test(userId.trim());
}

export type BalanceSplit = {
  wallet: number;
  bonus: number;
};

export type DebitResult =
  | { ok: true; walletDeducted: number; bonusDeducted: number }
  | { ok: false; reason: "insufficient_funds" | "user_not_found" };

/**
 * Debit a user wallet-first within an existing transaction (`tx`).
 * Fails atomically if combined balance < amount.
 */
export async function debitBalanceInTx(
  tx: unknown,
  userId: string,
  amount: number
): Promise<DebitResult> {
  if (!isNumericUserId(userId)) return { ok: false, reason: "user_not_found" };
  const cost = roundMoney(amount);
  if (cost <= 0) return { ok: true, walletDeducted: 0, bonusDeducted: 0 };

  const rows = await raw(tx).$queryRawUnsafe(
    `SELECT wallet::text AS wallet, bonus::text AS bonus
       FROM custom_auth_user
      WHERE abstractuser_ptr_id = ${userId}
        FOR UPDATE`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "user_not_found" };
  }

  const wallet = Math.max(0, Number(rows[0].wallet ?? 0));
  const bonus = Math.max(0, Number(rows[0].bonus ?? 0));

  if (roundMoney(wallet + bonus) < cost) {
    return { ok: false, reason: "insufficient_funds" };
  }

  const walletDeducted = Math.min(wallet, cost);
  const remaining = roundMoney(cost - walletDeducted);
  const bonusDeducted = remaining > 0 ? Math.min(bonus, remaining) : 0;

  await raw(tx).$executeRawUnsafe(
    `UPDATE custom_auth_user
        SET wallet = wallet - ${numericLiteral(walletDeducted)},
            bonus  = bonus  - ${numericLiteral(bonusDeducted)}
      WHERE abstractuser_ptr_id = ${userId}`
  );

  return {
    ok: true,
    walletDeducted: roundMoney(walletDeducted),
    bonusDeducted: roundMoney(bonusDeducted),
  };
}

/** Credit wallet and/or bonus in an existing transaction. */
export async function creditBalanceInTx(
  tx: unknown,
  userId: string,
  split: Partial<BalanceSplit>
): Promise<boolean> {
  if (!isNumericUserId(userId)) return false;
  const walletDelta = roundMoney(split.wallet ?? 0);
  const bonusDelta = roundMoney(split.bonus ?? 0);
  if (walletDelta <= 0 && bonusDelta <= 0) return true;

  const updated = await raw(tx).$executeRawUnsafe(
    `UPDATE custom_auth_user
        SET wallet = wallet + ${numericLiteral(walletDelta)},
            bonus  = bonus  + ${numericLiteral(bonusDelta)}
      WHERE abstractuser_ptr_id = ${userId}`
  );
  return updated > 0;
}

/** Wallet-first debit in its own transaction. */
export async function debitBalance(userId: string, amount: number): Promise<DebitResult> {
  return (prisma as any).$transaction((tx: unknown) => debitBalanceInTx(tx, userId, amount));
}

/** Credit wallet and/or bonus in its own transaction. */
export async function creditBalance(
  userId: string,
  split: Partial<BalanceSplit>
): Promise<boolean> {
  return (prisma as any).$transaction((tx: unknown) => creditBalanceInTx(tx, userId, split));
}

/** Read current balance without locking (UX checks only — never gate a debit on this). */
export async function readBalance(
  userId: string
): Promise<{ wallet: number; bonus: number } | null> {
  if (!isNumericUserId(userId)) return null;
  const rows = await raw(prisma).$queryRawUnsafe(
    `SELECT wallet::text AS wallet, bonus::text AS bonus
       FROM custom_auth_user
      WHERE abstractuser_ptr_id = ${userId}`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { wallet: Number(rows[0].wallet ?? 0), bonus: Number(rows[0].bonus ?? 0) };
}

// ─── Bot bankroll (RandomPlayer.wallet) ───────────────────────────────────────

/** Atomic bot bankroll debit; `ok: false` when the bankroll cannot cover it. */
export async function debitBotWalletInTx(
  tx: unknown,
  randomPlayerId: number,
  amount: number
): Promise<boolean> {
  const cost = roundMoney(amount);
  if (cost <= 0) return true;
  const updated = await raw(tx).$executeRawUnsafe(
    `UPDATE "RandomPlayer"
        SET wallet = wallet - ${numericLiteral(cost)}
      WHERE id = ${Number(randomPlayerId)}
        AND wallet >= ${numericLiteral(cost)}`
  );
  return updated > 0;
}

/** Atomic bot bankroll credit (refunds and bot winnings). */
export async function creditBotWalletInTx(
  tx: unknown,
  randomPlayerId: number,
  amount: number
): Promise<boolean> {
  const credit = roundMoney(amount);
  if (credit <= 0) return true;
  const updated = await raw(tx).$executeRawUnsafe(
    `UPDATE "RandomPlayer"
        SET wallet = wallet + ${numericLiteral(credit)}
      WHERE id = ${Number(randomPlayerId)}`
  );
  return updated > 0;
}

// ─── Money-safety schema probe ────────────────────────────────────────────────

export type MoneySafetySchema = {
  charges: boolean;
  refundedAt: boolean;
  ledger: boolean;
  refundLog: boolean;
  refundLogUnique: boolean;
};

let schemaCache: MoneySafetySchema | null = null;
let schemaWarned = false;

export async function getMoneySafetySchema(force = false): Promise<MoneySafetySchema> {
  const cached = schemaCache;
  if (cached && !force) return cached;

  let probed: MoneySafetySchema;
  try {
    const rows = await raw(prisma).$queryRawUnsafe(
      `SELECT to_regclass('public.game_charge')   IS NOT NULL AS charges,
              to_regclass('public.wallet_ledger') IS NOT NULL AS ledger,
              to_regclass('public.refund_log')    IS NOT NULL AS refund_log,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'game' AND column_name = 'refunded_at'
              ) AS refunded_at,
              EXISTS (
                SELECT 1 FROM pg_indexes
                 WHERE tablename = 'refund_log'
                   AND indexname = 'refund_log_game_user_reason_key'
              ) AS refund_log_unique`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    probed = {
      charges: Boolean(row?.charges),
      refundedAt: Boolean(row?.refunded_at),
      ledger: Boolean(row?.ledger),
      refundLog: Boolean(row?.refund_log),
      refundLogUnique: Boolean(row?.refund_log_unique),
    };
  } catch (err) {
    console.error("[balance] money-safety schema probe failed:", err);
    probed = {
      charges: false,
      refundedAt: false,
      ledger: false,
      refundLog: false,
      refundLogUnique: false,
    };
  }
  schemaCache = probed;

  if (!schemaWarned && (!probed.charges || !probed.refundedAt)) {
    schemaWarned = true;
    console.warn(
      "[balance] money-safety tables missing (game_charge / game.refunded_at). " +
        "Run prisma/manual_money_safety.sql on this database — refunds fall back to " +
        "stake × card count and are less precise until then."
    );
  }
  return probed;
}

// ─── Charge ledger ───────────────────────────────────────────────────────────

export type ChargeRecord = {
  gameId: string;
  userId: string;
  amount: number;
  walletPart: number;
  bonusPart: number;
  kind: string;
};

/**
 * Record what a player actually paid. Unique on (gameId, userId) so a duplicate
 * charge attempt cannot create a second row, which is what makes refunds exact.
 */
export async function recordChargeInTx(tx: unknown, charge: ChargeRecord): Promise<void> {
  const schema = await getMoneySafetySchema();
  if (!schema.charges) return;
  await raw(tx).$executeRawUnsafe(
    `INSERT INTO game_charge (id, game_id, user_id, amount, wallet_part, bonus_part, kind, created_at)
     VALUES ($1, $2, $3, ${numericLiteral(charge.amount)},
             ${numericLiteral(charge.walletPart)}, ${numericLiteral(charge.bonusPart)}, $4, NOW())
     ON CONFLICT (game_id, user_id) DO NOTHING`,
    newRowId(),
    charge.gameId,
    charge.userId,
    charge.kind
  );
}

export type ChargeRow = {
  userId: string;
  amount: number;
  walletPart: number;
  bonusPart: number;
};

/** All recorded charges for a game (empty when the ledger is absent or unused). */
export async function getChargesForGame(gameId: string): Promise<ChargeRow[]> {
  const schema = await getMoneySafetySchema();
  if (!schema.charges) return [];
  const rows = await raw(prisma).$queryRawUnsafe(
    `SELECT user_id AS "userId",
            amount::text      AS amount,
            wallet_part::text AS "walletPart",
            bonus_part::text  AS "bonusPart"
       FROM game_charge
      WHERE game_id = $1`,
    gameId
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    userId: String(r.userId),
    amount: Number(r.amount ?? 0),
    walletPart: Number(r.walletPart ?? 0),
    bonusPart: Number(r.bonusPart ?? 0),
  }));
}

/** Append-only audit row; best-effort so a missing table never blocks money movement. */
export async function writeLedgerInTx(
  tx: unknown,
  entry: {
    userId: string;
    delta: number;
    kind: string;
    refType?: string;
    refId?: string;
  }
): Promise<void> {
  const schema = await getMoneySafetySchema();
  if (!schema.ledger) return;
  try {
    await raw(tx).$executeRawUnsafe(
      `INSERT INTO wallet_ledger (id, user_id, delta, kind, ref_type, ref_id, created_at)
       VALUES ($1, $2, ${numericLiteral(entry.delta)}, $3, $4, $5, NOW())`,
      newRowId(),
      entry.userId,
      entry.kind,
      entry.refType ?? null,
      entry.refId ?? null
    );
  } catch (err) {
    console.error("[balance] wallet_ledger insert failed:", err);
  }
}
