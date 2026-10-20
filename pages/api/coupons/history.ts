import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken, getCustomAuthUserById } from "@/lib/custom-auth";
import { getCouponHistory } from "@/lib/coupons/application/coupon-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const user = await getCustomAuthUserById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  return res.status(200).json(await getCouponHistory(userId));
}
