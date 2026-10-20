import { prisma } from "@/lib/prisma";
import type { GameRepository } from "@/lib/games/application/game-service";

export const prismaGameRepository: GameRepository = {
  async codeExists(code) {
    return Boolean(await prisma.game.findUnique({ where: { code }, select: { id: true } }));
  },

  async create(data) {
    return prisma.game.create({
      data,
      select: { id: true, code: true, name: true, stake: true, stakeCurrency: true },
    });
  },

  async list(where) {
    const games = await prisma.game.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        stake: true,
        stakeCurrency: true,
        status: true,
        maxPlayers: true,
        _count: { select: { players: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return games.map(({ _count, ...game }) => ({
      ...game,
      playerCount: _count.players,
    }));
  },
};