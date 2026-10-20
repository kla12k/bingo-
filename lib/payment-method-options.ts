export type PaymentMethodKey =
  | "telebirr"
  | "cbe"
  | "cbe_birr"
  | "mpesa"
  | "ebirr"
  | "boa";

export type PaymentMethodOption = {
  id: PaymentMethodKey;
  label: string;
  labelAm: string;
  logo: string;
};

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { id: "telebirr", label: "Telebirr", labelAm: "ቴሌብር", logo: "/payments/telebirr.png" },
  { id: "cbe", label: "CBE", labelAm: "CBE", logo: "/payments/cbe.png" },
  { id: "cbe_birr", label: "CBE Birr", labelAm: "CBE ብር", logo: "/payments/cbe-birr.png" },
  { id: "mpesa", label: "MPESA", labelAm: "MPESA", logo: "/payments/mpesa.svg" },
  { id: "ebirr", label: "E-BIRR", labelAm: "E-BIRR", logo: "/payments/ebirr.webp" },
  { id: "boa", label: "BOA", labelAm: "BOA", logo: "/payments/boa.png" },
];

export const DEPOSIT_AMOUNT_PRESETS = [50, 100, 200, 500, 1000, 2000, 3000] as const;

/** Match a stored deposit/withdraw account name to a UI payment method key. */
export function paymentMethodKeyFromName(name: string): PaymentMethodKey | null {
  const lower = (name || "").trim().toLowerCase();
  if (!lower) return null;

  if (lower.includes("telebirr")) return "telebirr";
  if (lower.includes("cbe_birr") || lower.includes("cbe birr")) return "cbe_birr";
  if (lower.includes("mpesa")) return "mpesa";
  if (lower.includes("e-birr") || lower.includes("ebirr") || lower.includes("e birr")) return "ebirr";
  if (lower.includes("boa") || lower.includes("abyssinia") || lower.includes("bank of abyssinia")) return "boa";
  if (lower === "cbe" || (lower.includes("cbe") && !lower.includes("birr"))) return "cbe";

  return null;
}

export function findDepositAccountByKey<T extends { name: string }>(
  key: PaymentMethodKey,
  accounts: T[],
): T | undefined {
  return accounts.find((account) => paymentMethodKeyFromName(account.name) === key);
}

export function isWithdrawMethodAvailable(key: PaymentMethodKey, methods: string[]): boolean {
  return methods.some((name) => paymentMethodKeyFromName(name) === key);
}
