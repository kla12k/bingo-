import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { getTransferHistory } from "@/lib/wallet/application/transfer-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;

    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
        return res.status(200).json(await getTransferHistory(userId, req.query));
    } catch (error: any) {
        console.error("[TRANSFER_HISTORY_ERROR]", error);
        return res.status(500).json({ error: error?.message || "Failed to fetch transfer history" });
    }
}
