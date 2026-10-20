import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken, getCustomAuthUserById } from "@/lib/custom-auth";
import { getUserPaymentStats } from "@/lib/payments/application/payment-service";
import { getUserGameStats } from "@/lib/games/application/game-history-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;

    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
        const user = await getCustomAuthUserById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const gameStats = await getUserGameStats(userId);
        const paymentStats = await getUserPaymentStats(userId);

        return res.status(200).json({
            ...gameStats,
            ...paymentStats,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch stats" });
    }
}
