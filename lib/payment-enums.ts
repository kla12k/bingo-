/**
 * Payment enum indices as stored in DB (payment_request table).
 */

export const PaymentType = {
  DEPOSIT: 0,
  WITHDRAWAL: 1,
} as const;

export const PaymentStatus = {
  ACCEPTED: 0,
  PENDING: 1,
  REJECTED: 2,
} as const;

export const PaymentMethod = {
  TELEBIRR: 0,
  CBE: 1,
  MPESA: 2,
  CBE_BIRR: 3,
} as const;

const PAYMENT_TYPE_LABELS: Record<number, string> = {
  [PaymentType.DEPOSIT]: "DEPOSIT",
  [PaymentType.WITHDRAWAL]: "WITHDRAWAL",
};

const PAYMENT_STATUS_LABELS: Record<number, string> = {
  [PaymentStatus.ACCEPTED]: "ACCEPTED",
  [PaymentStatus.PENDING]: "PENDING",
  [PaymentStatus.REJECTED]: "REJECTED",
};

const PAYMENT_METHOD_LABELS: Record<number, string> = {
  [PaymentMethod.TELEBIRR]: "TELEBIRR",
  [PaymentMethod.CBE]: "CBE",
  [PaymentMethod.MPESA]: "MPESA",
  [PaymentMethod.CBE_BIRR]: "CBE_BIRR",
};

export function paymentTypeLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  return PAYMENT_TYPE_LABELS[n] ?? "—";
}

export function paymentStatusLabel(n: number): string {
  return PAYMENT_STATUS_LABELS[n] ?? "—";
}

export function paymentMethodLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  return PAYMENT_METHOD_LABELS[n] ?? "—";
}

/** Map bank/method name (e.g. from form or deposit account) to PaymentMethod index. */
export function paymentMethodFromName(name: string): number | null {
  const s = (name || "").trim();
  if (/^\d+$/.test(s)) {
    const idx = Number(s);
    if (idx >= 0 && idx <= 3) return idx;
  }
  const lower = s.toLowerCase();
  if (lower.includes("telebirr")) return PaymentMethod.TELEBIRR;
  if (lower.includes("cbe_birr") || lower.includes("cbe birr")) return PaymentMethod.CBE_BIRR;
  if (lower.includes("cbe")) return PaymentMethod.CBE;
  if (lower.includes("mpesa")) return PaymentMethod.MPESA;
  return null;
}
