import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { claimCoupon, CouponServiceError } from "@/lib/coupons/application/coupon-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    return res.status(200).json(await claimCoupon(userId, req.body?.code));
  } catch (error) {
    if (error instanceof CouponServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Failed to claim coupon" });
  }
}
