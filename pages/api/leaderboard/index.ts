import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { getLeaderboards } from "@/lib/leaderboard-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;

    try {
        const result = await getLeaderboards(userId);
        res.setHeader("Cache-Control", result.cacheControl);
        return res.status(200).json(result.data);

    } catch (error) {
        console.error("Leaderboard API Error:", error);
        return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
}
