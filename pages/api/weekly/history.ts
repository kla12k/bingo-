import type { NextApiRequest, NextApiResponse } from "next";
import { listFinishedWeeklyEditionsPaginated } from "@/lib/weekly-bingo-db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const result = await listFinishedWeeklyEditionsPaginated(page, limit);

    return res.status(200).json({
      editions: result.rows.map((e) => ({
        id: e.id,
        title: e.title,
        stake: e.stake,
        pattern: e.pattern,
        starts_at: e.startsAt.toISOString(),
        finished_at: e.finishedAt?.toISOString() ?? null,
        prize_pool: e.prizePool,
        winner_price: e.winnerPrice,
        winner_names: e.winnerNames,
        winner_card_ids: e.winnerCardIds,
        total_calls: e.calledNumbers.length,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    console.error("[api/weekly/history]", err);
    return res.status(500).json({ error: "Failed to load history" });
  }
}
