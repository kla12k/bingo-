import type { NextApiRequest, NextApiResponse } from "next";
import { StakeServiceError, clearSelectedStakeCards } from "@/lib/stakes/application/stake-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    return res.status(200).json(
      await clearSelectedStakeCards(req.headers.authorization, req.body?.stake)
    );
  } catch (error) {
    if (error instanceof StakeServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Failed to clear selected cards" });
  }
}
