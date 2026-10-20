import { prisma } from "@/lib/prisma";
import { getCustomAuthUserById, updateCustomAuthUserWalletBonus } from "@/lib/custom-auth";

const db = prisma as any;

export class CouponServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function claimCoupon(userId: string, rawCode: unknown) {
  const user = await getCustomAuthUserById(userId);
  if (!user) throw new CouponServiceError(404, "User not found");
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code) throw new CouponServiceError(400, "Coupon code is required");

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) throw new CouponServiceError(404, "Invalid or expired coupon");
  const now = new Date();
  if (coupon.startAt != null && now < new Date(coupon.startAt)) {
    throw new CouponServiceError(400, "This coupon is not yet valid");
  }
  if (coupon.expiresAt != null && now > new Date(coupon.expiresAt)) {
    throw new CouponServiceError(400, "This coupon has expired");
  }
  if (coupon.maxClaims != null) {
    const count = await db.couponClaim.count({ where: { couponId: coupon.id } });
    if (count >= coupon.maxClaims) {
      throw new CouponServiceError(400, "This coupon has reached its claim limit");
    }
  }

  const userIdBigInt = BigInt(userId);
  const existing = await db.couponClaim.findUnique({
    where: { couponId_userId: { couponId: coupon.id, userId: userIdBigInt } },
  });
  if (existing) throw new CouponServiceError(400, "You have already claimed this coupon");

  const rewardValue = Number(coupon.rewardValue ?? 0);
  if (rewardValue > 0) {
    if (coupon.rewardType === "wallet") {
      await updateCustomAuthUserWalletBonus(userId, { wallet: Number(user.wallet) + rewardValue });
    } else if (coupon.rewardType === "bonus" || !coupon.rewardType) {
      await updateCustomAuthUserWalletBonus(userId, { bonus: Number(user.bonus) + rewardValue });
    }
  }

  await db.couponClaim.create({ data: { couponId: coupon.id, userId: userIdBigInt } });
  return {
    success: true,
    message: "Coupon claimed successfully",
    rewardValue,
    rewardType: coupon.rewardType ?? "bonus",
  };
}

export async function getCouponHistory(userId: string) {
  const claims = await db.couponClaim.findMany({
    where: { userId: BigInt(userId) },
    orderBy: { claimedAt: "desc" },
    include: {
      coupon: {
        select: {
          code: true,
          description: true,
          rewardType: true,
          rewardValue: true,
          startAt: true,
          expiresAt: true,
        },
      },
    },
  });

  return {
    history: claims.map((claim: any) => ({
      id: claim.id,
      code: claim.coupon?.code ?? "",
      description: claim.coupon?.description ?? null,
      rewardType: claim.coupon?.rewardType ?? "bonus",
      rewardValue: claim.coupon?.rewardValue != null ? Number(claim.coupon.rewardValue) : 0,
      startAt: claim.coupon?.startAt ?? null,
      expiresAt: claim.coupon?.expiresAt ?? null,
      claimedAt: claim.claimedAt,
    })),
  };
}