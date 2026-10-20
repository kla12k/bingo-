import type { NextApiRequest, NextApiResponse } from "next";
import {
  BotScheduleServiceError,
  getStakeBotSchedule,
  removeStakeBotScheduleOverride,
  updateStakeBotSchedule,
} from "@/lib/bot-schedule-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const stakeRaw = Number(req.query.stake);
  if (!Number.isFinite(stakeRaw) || stakeRaw <= 0) {
    return res.status(400).json({ error: "Invalid stake" });
  }
  const stake = stakeRaw;

  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await getStakeBotSchedule(stake));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to load stake bot schedule" });
    }
  }

  if (req.method === "PUT") {
    try {
      return res.status(200).json(
        await updateStakeBotSchedule(req.headers.authorization, stake, req.body ?? {})
      );
    } catch (e) {
      if (e instanceof BotScheduleServiceError) {
        return res.status(e.status).json({ error: e.message });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to update stake bot schedule" });
    }
  }

  if (req.method === "DELETE") {
    try {
      return res.status(200).json(
        await removeStakeBotScheduleOverride(req.headers.authorization, stake)
      );
    } catch (e) {
      if (e instanceof BotScheduleServiceError) {
        return res.status(e.status).json({ error: e.message });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to delete stake bot schedule override" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
