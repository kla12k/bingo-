/**
 * API route to run stuck-game cleanup. Call this from an external cron (e.g. every 3 min)
 * so stuck games are cleaned even if the socket server restarted or is down.
 * Secure with CRON_SECRET header: X-Cron-Secret: <CRON_SECRET>
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { runStuckGameCronOnce } from "../../../server/stuck-game-cron";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers["x-cron-secret"] ?? req.query.secret;
    if (provided !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    await runStuckGameCronOnce();
    return res.status(200).json({ ok: true, message: "Stuck games cron ran" });
  } catch (err) {
    console.error("[api/cron/stuck-games] error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Cron failed" });
  }
}
