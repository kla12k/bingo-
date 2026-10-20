import type { NextApiRequest, NextApiResponse } from "next";
import { getGameByCode } from "@/lib/games/application/game-history-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  const gameNumber = (req.query.code as string)?.toUpperCase();
  if (!gameNumber) {
    res.status(400).json({ error: "Code required" });
    return;
  }
  const game = await getGameByCode(gameNumber);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.status(200).json(game);
}
