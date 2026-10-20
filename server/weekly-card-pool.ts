import { prisma } from "../lib/prisma";

const WEEKLY_POOL_SIZE = 500;

export async function getWeeklyAvailableCardIds(
  selectedPlayers: { user: string; card: number[] }[]
): Promise<number[]> {
  const used = new Set<number>();
  selectedPlayers.forEach((p) => p.card.forEach((id) => used.add(id)));
  const all = await prisma.weeklyGameCard.findMany({
    where: { id: { lte: BigInt(WEEKLY_POOL_SIZE) } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return all
    .filter((c: { id: bigint }) => !used.has(Number(c.id)))
    .map((c: { id: bigint }) => Number(c.id));
}

export async function getWeeklyCardNumbers(
  cardIds: number[]
): Promise<Map<number, number[][]>> {
  const cards = await prisma.weeklyGameCard.findMany({
    where: { id: { in: cardIds.map((id) => BigInt(id)) } },
    select: { id: true, numbers: true },
  });
  const map = new Map<number, number[][]>();
  cards.forEach((c: { id: bigint; numbers: unknown }) =>
    map.set(Number(c.id), c.numbers as number[][])
  );
  return map;
}
