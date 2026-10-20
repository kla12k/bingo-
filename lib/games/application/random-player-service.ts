import { prisma } from "@/lib/prisma";

export async function getRandomPlayerConfig(stake?: number) {
  if (stake != null) return prisma.randomPlayer.findFirst({ where: { stake } });
  return prisma.randomPlayer.findMany({ orderBy: { stake: "asc" } });
}

export async function saveRandomPlayerConfig(
  operation: "create" | "update",
  input: { id?: number; on_off?: boolean; stake?: number; names?: string[]; wallet?: number; number_of_players?: number }
) {
  if (operation === "create") {
    return prisma.randomPlayer.create({
      data: {
        on_off: input.on_off ?? false,
        stake: input.stake ?? 0,
        names: input.names ?? [],
        wallet: input.wallet ?? 0,
        number_of_players: input.number_of_players ?? 0,
      },
    });
  }
  if (input.id == null) throw new Error("id is required");
  return prisma.randomPlayer.update({
    where: { id: input.id },
    data: {
      ...(input.on_off !== undefined && { on_off: input.on_off }),
      ...(input.stake !== undefined && { stake: input.stake }),
      ...(input.names !== undefined && { names: input.names }),
      ...(input.wallet !== undefined && { wallet: input.wallet }),
      ...(input.number_of_players !== undefined && { number_of_players: input.number_of_players }),
    },
  });
}