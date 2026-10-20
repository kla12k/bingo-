import type { NextApiRequest, NextApiResponse } from "next";
import { getJackpotSummary } from "@/lib/games/application/jackpot-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const stakeParam = req.query.stake;
  const stake = typeof stakeParam === "string" ? Number(stakeParam) : NaN;

  if (!Number.isFinite(stake) || stake <= 0) {
    res.status(400).json({ error: "Invalid stake" });
    return;
  }

  try {
    return res.status(200).json(await getJackpotSummary(stake));
  } catch (error) {
    if (error instanceof Error && error.message === "Stake is not active") {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
}

