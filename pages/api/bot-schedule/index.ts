import type { NextApiRequest, NextApiResponse } from "next";
import {
  BotScheduleServiceError,
  getBotSchedule,
  updateBotSchedule,
} from "@/lib/bot-schedule-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await getBotSchedule());
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to load bot schedule" });
    }
  }

  if (req.method === "PUT") {
    try {
      return res.status(200).json(
        await updateBotSchedule(req.headers.authorization, req.body ?? {})
      );
    } catch (e) {
      if (e instanceof BotScheduleServiceError) {
        return res.status(e.status).json({ error: e.message });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to update bot schedule" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
