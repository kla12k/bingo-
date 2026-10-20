import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  getCustomAuthUserById,
  updateCustomAuthAffiliateReservedAmount,
} from "@/lib/custom-auth";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/payment-enums";

const db = prisma as any;
const paymentApiUrl = process.env.PAYMENT_API_URL || "http://localhost:8085";

export class AffiliateServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: string
  ) {
    super(message);
  }
}

async function requireAffiliate(userId: string) {
  const user = await getCustomAuthUserById(userId);
  if (!user) throw new AffiliateServiceError(404, "User not found");
  if (!user.is_affiliate) throw new AffiliateServiceError(403, "User is not an affiliate.");
  return user;
}

async function requireAffiliateTelegramId(userId: string) {
  const user = await requireAffiliate(userId);
  if (!user.telegram_id) {
    throw new AffiliateServiceError(400, "Affiliate does not have a Telegram ID set.");
  }
  return { user, telegramId: user.telegram_id };
}

export async function getAffiliateStats(userId: string) {
  const { user, telegramId } = await requireAffiliateTelegramId(userId);
  const total_balance = user.affiliate_wallet || 0;
  const referrals_count = await db.customAuthUser.count({ where: { reference: telegramId } });
  const approvedWithdrawals = await db.affiliateWithdrawRequest.aggregate({
    where: { userId: BigInt(userId), status: 1 },
    _sum: { amount: true },
  });
  const total_withdrawn = approvedWithdrawals._sum.amount || 0;

  return {
    total_balance,
    referrals_count,
    total_earned:
      Number(total_balance) +
      Number(user.affiliate_reserved_amount || 0) +
      Number(total_withdrawn),
  };
}

export async function getAffiliateTransactions(
  userId: string,
  query: Record<string, string | undefined>
) {
  const { telegramId } = await requireAffiliateTelegramId(userId);
  const pageNum = parseInt(query.page ?? "1");
  const limitNum = parseInt(query.limit ?? "10");
  const skip = (pageNum - 1) * limitNum;
  const referralUsers = await db.customAuthUser.findMany({
    where: { reference: telegramId },
    select: { abstractuser_ptr_id: true },
  });
  const referralIds = referralUsers.map((referral: any) => String(referral.abstractuser_ptr_id));

  if (referralIds.length === 0) {
    return { count: 0, next: null, previous: null, results: [] };
  }

  const txFilter: any = {
    user_id: { in: referralIds },
    payment_type: 0,
    payment_status: 0,
  };

  if (query.user_id) txFilter.user_id = query.user_id;

  if (query.start_date || query.end_date) {
    txFilter.created_at = {};
    if (query.start_date) txFilter.created_at.gte = new Date(query.start_date);
    if (query.end_date) txFilter.created_at.lte = new Date(query.end_date);
  }

  if (query.search) {
    const matchingUsers = await db.customAuthAbstractuser.findMany({
      where: {
        id: { in: referralIds.map((id: string) => BigInt(id)) },
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { phone_number: { contains: query.search, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    const matchingIds = matchingUsers.map((user: any) => String(user.id));
    txFilter.user_id = query.user_id
      ? matchingIds.includes(query.user_id)
        ? query.user_id
        : "none"
      : { in: matchingIds };
  }

  const totalCount = await prisma.paymentRequest.count({ where: txFilter });
  const transactions = await prisma.paymentRequest.findMany({
    where: txFilter,
    orderBy: { created_at: "desc" },
    skip,
    take: limitNum,
  });
  const transactionUserIds = Array.from(new Set(transactions.map((transaction) => transaction.user_id)));
  const users = await db.customAuthAbstractuser.findMany({
    where: { id: { in: transactionUserIds.map((id: string) => BigInt(id)) } },
    select: { id: true, name: true },
  });
  const usersMap = users.reduce((result: Record<string, string>, user: any) => {
    result[String(user.id)] = user.name;
    return result;
  }, {});

  return {
    count: totalCount,
    next: totalCount > skip + limitNum ? true : null,
    previous: skip > 0 ? true : null,
    results: transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      created_at: transaction.created_at,
      user_id: transaction.user_id,
      user_name: usersMap[transaction.user_id] ?? "Unknown User",
      payment_type: 0,
      payment_status: 0,
    })),
  };
}

export async function getAffiliateReferrals(
  userId: string,
  query: Record<string, string | undefined>
) {
  const { telegramId } = await requireAffiliateTelegramId(userId);
  const pageNum = parseInt(query.page ?? "1");
  const limitNum = parseInt(query.limit ?? "10");
  const skip = (pageNum - 1) * limitNum;
  const userFilter: any = { reference: telegramId };

  if (query.search) {
    userFilter.OR = [
      { abstractuser: { name: { contains: query.search, mode: "insensitive" } } },
      { abstractuser: { phone_number: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  if (query.start_date || query.end_date) {
    userFilter.abstractuser = { ...userFilter.abstractuser, date_joined: {} };
    if (query.start_date) userFilter.abstractuser.date_joined.gte = new Date(query.start_date);
    if (query.end_date) userFilter.abstractuser.date_joined.lte = new Date(query.end_date);
  }

  const totalCount = await db.customAuthUser.count({ where: userFilter });
  const referrals = await db.customAuthUser.findMany({
    where: userFilter,
    include: { abstractuser: true },
    orderBy: { abstractuser: { date_joined: "desc" } },
    skip,
    take: limitNum,
  });
  const referralIds = referrals.map((referral: any) => String(referral.abstractuser_ptr_id));
  const deposits = await prisma.paymentRequest.groupBy({
    by: ["user_id"],
    where: { user_id: { in: referralIds }, payment_type: 0, payment_status: 0 },
    _sum: { amount: true },
  });
  const depositsMap = deposits.reduce((result, deposit) => {
    result[deposit.user_id] = deposit._sum.amount || 0;
    return result;
  }, {} as Record<string, number>);

  return {
    count: totalCount,
    next: totalCount > skip + limitNum ? true : null,
    previous: skip > 0 ? true : null,
    results: referrals.map((referral: any) => ({
      id: String(referral.abstractuser_ptr_id),
      name: referral.abstractuser.name,
      phone_number: referral.abstractuser.phone_number,
      date_joined: referral.abstractuser.date_joined,
      total_deposited: depositsMap[String(referral.abstractuser_ptr_id)] || 0,
    })),
  };
}

export async function createAffiliateWithdrawal(
  userId: string,
  input: { amount?: unknown; bank_name?: unknown; account_number?: unknown }
) {
  const user = await requireAffiliate(userId);
  if (!input.amount || !input.bank_name || !input.account_number) {
    throw new AffiliateServiceError(400, "Amount, bank name, and account number are required.");
  }

  const amount = parseFloat(String(input.amount));
  if (isNaN(amount) || amount <= 0) throw new AffiliateServiceError(400, "Invalid amount.");
  const currentBalance = user.affiliate_wallet || 0;
  if (currentBalance < amount) {
    throw new AffiliateServiceError(400, "Insufficient affiliate balance.");
  }

  const reference = crypto.randomBytes(4).toString("hex").toUpperCase();
  const totalReserved = (user.affiliate_reserved_amount || 0) + amount;
  const remainingBalance = currentBalance - amount;
  await updateCustomAuthAffiliateReservedAmount(userId, totalReserved, remainingBalance);
  await db.affiliateWithdrawRequest.create({
    data: {
      userId: BigInt(userId),
      amount,
      bankName: input.bank_name,
      accountNumber: input.account_number,
      referenceNumber: reference,
      status: 0,
    },
  });

  return {
    message: "Withdrawal request created successfully.",
    reference,
    remaining_balance: remainingBalance,
  };
}

export async function getAffiliateWithdrawHistory(
  userId: string,
  query: Record<string, string | undefined>
) {
  await requireAffiliate(userId);
  const pageNum = parseInt(query.page ?? "1");
  const limitNum = parseInt(query.limit ?? "10");
  const skip = (pageNum - 1) * limitNum;
  const filter: any = { userId: BigInt(userId) };

  if (query.status) {
    const statusMap: Record<string, number> = { pending: 0, accepted: 1, rejected: 2 };
    const status = statusMap[query.status.toLowerCase()];
    if (status !== undefined) filter.status = status;
    else if (!isNaN(parseInt(query.status))) filter.status = parseInt(query.status);
  }

  const totalCount = await db.affiliateWithdrawRequest.count({ where: filter });
  const withdrawals = await db.affiliateWithdrawRequest.findMany({
    where: filter,
    orderBy: { createdAt: "desc" },
    skip,
    take: limitNum,
  });

  return {
    count: totalCount,
    next: totalCount > skip + limitNum ? true : null,
    previous: skip > 0 ? true : null,
    results: withdrawals.map((withdrawal: any) => ({
      id: withdrawal.id.toString(),
      amount: withdrawal.amount,
      bank_name: withdrawal.bankName,
      account_number: withdrawal.accountNumber,
      reference_number: withdrawal.referenceNumber,
      status: withdrawal.status === 0 ? "pending" : withdrawal.status === 1 ? "accepted" : "rejected",
      created_at: withdrawal.createdAt,
      updated_at: withdrawal.updatedAt,
    })),
  };
}

export async function getReferredUserDeposits(affiliateId: string, targetUserId: string) {
  const affiliate = await getCustomAuthUserById(affiliateId);
  if (!affiliate || !affiliate.is_affiliate) {
    throw new AffiliateServiceError(403, "Unauthorized access");
  }

  const targetUserExt = await prisma.customAuthUser.findUnique({
    where: { abstractuser_ptr_id: BigInt(targetUserId) },
  });
  if (!targetUserExt || targetUserExt.reference !== affiliate.telegram_id) {
    throw new AffiliateServiceError(403, "Access denied: User not referred by you.");
  }

  const targetUser = await prisma.customAuthAbstractuser.findUnique({
    where: { id: BigInt(targetUserId) },
  });
  const deposits = await prisma.paymentRequest.findMany({
    where: { user_id: targetUserId, payment_type: 0, payment_status: 0 },
    orderBy: { created_at: "desc" },
  });

  return {
    user_id: targetUserId,
    user_name: targetUser?.name || "Unknown",
    total_deposited: deposits.reduce((sum, transaction) => sum + transaction.amount, 0),
    deposit_history: deposits.map((deposit) => ({
      id: deposit.id,
      amount: deposit.amount,
      created_at: deposit.created_at,
      status: paymentStatusLabel(deposit.payment_status),
      type: paymentMethodLabel(deposit.payment_method) || "Direct",
    })),
  };
}

export async function joinAffiliateProgram(userId: string) {
  const response = await fetch(
    `${paymentApiUrl}/api/v1/users/affiliate/${encodeURIComponent(userId)}`,
    { method: "POST", headers: { "Content-Type": "application/json" } }
  );
  if (!response.ok) {
    const details = await response.text();
    throw new AffiliateServiceError(
      response.status,
      "Failed to join affiliate program",
      details || response.statusText
    );
  }

  try {
    await db.customAuthAbstractuser.update({
      where: { id: BigInt(userId) },
      data: { is_affiliate: true },
    });
  } catch (error) {
    console.warn("[affiliate/join] Failed to update is_affiliate in DB:", error);
  }

  return { success: true, message: "You are now an agent." };
}

export async function getAffiliateStatus(userId: string) {
  const user = await getCustomAuthUserById(userId);
  let status = user?.is_affiliate ?? false;

  if (!status) {
    const response = await fetch(
      `${paymentApiUrl}/api/v1/users/affiliate/${encodeURIComponent(userId)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    const data = await response.json().catch(() => ({}));
    status = Boolean(data?.status);

    if (status && user) {
      try {
        await db.customAuthAbstractuser.update({
          where: { id: BigInt(userId) },
          data: { is_affiliate: true },
        });
      } catch (error) {
        console.warn("[affiliate/status] Failed to update is_affiliate in DB:", error);
      }
    }
  }

  return { status };
}