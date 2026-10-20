import type { NextApiRequest, NextApiResponse } from "next";
import { createGame, listGames } from "@/lib/games/application/game-service";
import { prismaGameRepository } from "@/lib/games/infrastructure/prisma-game-repository";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    try {
      const game = await createGame(prismaGameRepository, req.body ?? {});
      res.status(200).json({
        id: game.id,
        code: game.code,
        name: game.name,
        stake: game.stake,
        stakeCurrency: game.stakeCurrency,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create game" });
    }
    return;
  }

  if (req.method === "GET") {
    try {
      const games = await listGames(prismaGameRepository, {
        stake: req.query.stake as string | undefined,
        stakeCurrency: req.query.stakeCurrency as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.status(200).json(games);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to list games" });
    }
    return;
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
