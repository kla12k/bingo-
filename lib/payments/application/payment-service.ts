import { prisma } from "@/lib/prisma";
import { getCustomAuthUserById } from "@/lib/custom-auth";
import {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  paymentMethodFromName,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTypeLabel,
} from "@/lib/payment-enums";

const paymentApiUrl = process.env.PAYMENT_API_URL || "http://localhost:8085";
const db = prisma as any;

export class PaymentServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function submitDeposit(userId: string, input: Record<string, unknown>) {
  const paymentMethod = input.paymentMethod;
  const transactionSMS = input.transactionSMS;
  if (!paymentMethod || !transactionSMS) {
    throw new PaymentServiceError(400, "Missing paymentMethod or transactionSMS");
  }

  const user = await getCustomAuthUserById(userId);
  if (!user) throw new PaymentServiceError(404, "User not found");

  const referenceId = crypto.randomUUID();
  const telegramId = user.telegram_id ?? "";
  const chatId = telegramId && /^\d+$/.test(telegramId) ? Number(telegramId) : 0;
  const methodIdx = paymentMethodFromName(String(paymentMethod)) ?? PaymentMethod.CBE;
  const payload = {
    referenceId,
    chatId,
    customerPhoneNumber: user.phone_number ?? "",
    paymentMethod: String(methodIdx),
    paymentType: "DEPOSIT",
    payment_type: PaymentType.DEPOSIT,
    payment_method: methodIdx,
    userId,
    transactionSMS: String(transactionSMS),
  };

  const paymentResponse = await fetch(`${paymentApiUrl}/api/v1/users/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok) {
    throw new PaymentServiceError(
      paymentResponse.status,
      String(data?.message || data?.error || "Payment request failed"),
      data
    );
  }

  const rawAmount = data?.amount;
  const amount = typeof rawAmount === "number"
    ? rawAmount
    : typeof rawAmount === "string"
      ? Number.parseFloat(rawAmount)
      : Number.isFinite(Number(rawAmount))
        ? Number(rawAmount)
        : 0;

  try {
    await db.paymentRequest.upsert({
      where: { reference_id: referenceId },
      create: {
        user_id: userId,
        reference_id: referenceId,
        amount: Number.isFinite(amount) ? amount : 0,
        payment_type: PaymentType.DEPOSIT,
        payment_method: methodIdx,
        payment_status: PaymentStatus.PENDING,
        transactionSMS: String(transactionSMS),
        customer_phone_number: user.phone_number ?? null,
        customer_chat_id: chatId ? BigInt(chatId) : null,
      },
      update: {
        payment_type: PaymentType.DEPOSIT,
        payment_method: methodIdx,
        transactionSMS: String(transactionSMS),
      },
    });
  } catch (error) {
    console.error("[DEPOSIT] payment_request upsert:", error);
  }

  return { message: "Deposit request sent", referenceId, ...data };
}

export async function submitWithdrawal(userId: string, input: Record<string, unknown>) {
  const { amount, bank, account_number } = input;
  if (!amount || !bank || !account_number) {
    throw new PaymentServiceError(400, "Missing required fields");
  }
  const withdrawAmount = Number(amount);
  if (isNaN(withdrawAmount) || withdrawAmount < 50) {
    throw new PaymentServiceError(400, "Minimum withdrawal is 50 ETB");
  }

  const user = await getCustomAuthUserById(userId);
  if (!user) throw new PaymentServiceError(404, "User not found");
  if (user.wallet < withdrawAmount) {
    throw new PaymentServiceError(400, "Insufficient wallet balance");
  }

  const telegramId = user.telegram_id ?? "";
  const chatId = telegramId && /^\d+$/.test(telegramId) ? Number(telegramId) : 0;
  const paymentMethod = paymentMethodFromName(String(bank)) ?? PaymentMethod.CBE;
  const payload = {
    referenceId: crypto.randomUUID(),
    chatId,
    customerPhoneNumber: String(account_number),
    amount: String(withdrawAmount),
    paymentMethod: String(paymentMethod),
    paymentType: "WITHDRAWAL",
    userId,
  };
  const paymentResponse = await fetch(`${paymentApiUrl}/api/v1/users/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok) {
    throw new PaymentServiceError(
      paymentResponse.status,
      String(data?.message || data?.error || "Payment request failed"),
      data
    );
  }
  return { message: "Withdrawal request submitted successfully", ...data };
}

export async function submitAutoDeposit(
  userId: string,
  input: { deposit_account_id?: unknown; transaction_id?: unknown }
) {
  if (!input.deposit_account_id || !input.transaction_id) {
    throw new PaymentServiceError(400, "Missing required fields");
  }

  const account = await db.depositAccount.findUnique({
    where: { id: input.deposit_account_id },
  });
  if (!account) throw new PaymentServiceError(404, "Account not found");

  const payment = await prisma.paymentRequest.create({
    data: {
      user_id: userId,
      payment_type: PaymentType.DEPOSIT,
      amount: 0,
      payment_status: PaymentStatus.PENDING,
      payment_method: paymentMethodFromName(account.name),
      reference_id: String(input.transaction_id),
    },
  });
  return { message: "Deposit request received.", transaction_id: payment.id };
}

export async function getTransactionHistory(
  userId: string,
  query: { page?: string | string[]; limit?: string | string[] }
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 10);
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    prisma.paymentRequest.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.paymentRequest.count({ where: { user_id: userId } }),
  ]);

  return {
    transactions: transactions.map((transaction) => ({
      ...transaction,
      customer_chat_id:
        transaction.customer_chat_id != null ? String(transaction.customer_chat_id) : null,
      payment_type: paymentTypeLabel(transaction.payment_type),
      payment_status: paymentStatusLabel(transaction.payment_status),
      payment_method: paymentMethodLabel(transaction.payment_method),
    })),
    total,
  };
}

export async function listDepositAccounts() {
  return { accounts: await db.depositAccount.findMany({ where: { active: true } }) };
}

export async function listOnlineAgentPaymentMethods() {
  const accounts = await prisma.agentsAccount.findMany({
    where: {
      isActive: true,
      paymentMethod: { not: null },
      agent: { enabled: true, status: true },
    },
    select: { paymentMethod: true },
    distinct: ["paymentMethod"],
  });
  const payment_methods = accounts
    .map((account) => paymentMethodLabel(Number(account.paymentMethod)))
    .filter((label) => label !== "—")
    .sort();
  return { payment_methods };
}

export async function getUserPaymentStats(userId: string) {
  const [deposits, withdrawals] = await Promise.all([
    prisma.paymentRequest.aggregate({
      where: { user_id: userId, payment_type: PaymentType.DEPOSIT, payment_status: PaymentStatus.ACCEPTED },
      _sum: { amount: true },
    }),
    prisma.paymentRequest.aggregate({
      where: { user_id: userId, payment_type: PaymentType.WITHDRAWAL, payment_status: PaymentStatus.ACCEPTED },
      _sum: { amount: true },
    }),
  ]);
  return {
    total_deposit: deposits._sum.amount || 0,
    total_withdrawal: withdrawals._sum.amount || 0,
  };
}