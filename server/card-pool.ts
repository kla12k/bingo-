import { prisma } from "../lib/prisma";
import { generateCardWithFreeSpace } from "../lib/bingo";

const POOL_SIZE = 500;

export async function ensureCardPool(): Promise<void> {
  const count = await prisma.gameCard.count();
  if (count >= POOL_SIZE) return;
  const toCreate = POOL_SIZE - count;
  const existing = new Set<string>();
  const rows = await prisma.gameCard.findMany({ select: { numbers: true } });
  rows.forEach((r: { numbers: unknown }) => existing.add(JSON.stringify(r.numbers)));

  for (let i = 0; i < toCreate; i++) {
    let card = generateCardWithFreeSpace();
    while (existing.has(JSON.stringify(card))) {
      card = generateCardWithFreeSpace();
    }
    existing.add(JSON.stringify(card));
    await prisma.gameCard.create({ data: { numbers: card } });
  }
}

export async function getAvailableCardIds(
  stake: number,
  selectedPlayers: { user: string; card: number[] }[]
): Promise<number[]> {
  await ensureCardPool();
  const used = new Set<number>();
  selectedPlayers.forEach((p) => p.card.forEach((id) => used.add(id)));
  const all = await prisma.gameCard.findMany({
    where: { id: { lte: BigInt(POOL_SIZE) } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return all.filter((c: { id: bigint }) => !used.has(Number(c.id))).map((c: { id: bigint }) => Number(c.id));
}

export async function getCardNumbers(cardIds: number[]): Promise<Map<number, number[][]>> {
  const cards = await prisma.gameCard.findMany({
    where: { id: { in: cardIds.map((id) => BigInt(id)) } },
    select: { id: true, numbers: true },
  });
  const map = new Map<number, number[][]>();
  cards.forEach((c: { id: bigint; numbers: unknown }) => map.set(Number(c.id), c.numbers as number[][]));
  return map;
}
