import type { NextApiRequest, NextApiResponse } from "next";
import { getShowAutoSelectButton, getPatternsRequired, getMaxCardsPerUser } from "@/lib/game-config";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const showAutoSelectButton = await getShowAutoSelectButton();
      const patternsRequired = await getPatternsRequired();
      const maxCardsPerUser = await getMaxCardsPerUser();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        showAutoSelectButton,
        patternsRequired,
        maxCardsPerUser,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to load game config" });
    }
  }
  res.setHeader("Allow", ["GET"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
