import type { NextApiRequest, NextApiResponse } from "next";
import {
  getWorkingHours,
  updateWorkingHours,
  WorkingHoursServiceError,
} from "@/lib/working-hours-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await getWorkingHours());
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to load working hours" });
    }
  }

  if (req.method === "PUT") {
    try {
      return res.status(200).json(
        await updateWorkingHours(req.headers.authorization, req.body ?? {})
      );
    } catch (e) {
      if (e instanceof WorkingHoursServiceError) {
        return res.status(e.status).json({ error: e.message });
      }
      console.error(e);
      return res.status(500).json({ error: "Failed to update working hours" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
}
