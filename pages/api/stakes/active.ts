import type { NextApiRequest, NextApiResponse } from "next";
import { getActiveGamesByStake } from "@/lib/active-games";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  try {
    const data = await getActiveGamesByStake();
    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch active games" });
  }
}
