import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { getCurrentWeeklyGame } from "@/lib/weekly-bingo-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;

    return res.status(200).json(
      await getCurrentWeeklyGame(req.query.edition_id as string | undefined, userId)
    );
  } catch (err) {
    console.error("[api/weekly/current]", err);
    return res.status(500).json({ error: "Failed to load weekly game" });
  }
}
