import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken, getCustomAuthUserById } from "@/lib/custom-auth";
import {
  getRandomPlayerConfig,
  saveRandomPlayerConfig,
} from "@/lib/games/application/random-player-service";

/** GET: List RandomPlayer configs (admin) or get by stake */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;

  if (req.method === "GET") {
    const stake = req.query.stake != null ? Number(req.query.stake) : null;
    if (stake != null && !Number.isNaN(stake)) {
      const rp = await getRandomPlayerConfig(stake);
      return res.status(200).json(rp ?? null);
    }
    // List all (admin only)
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const admin = await getCustomAuthUserById(userId);
    if (!admin?.is_superuser || !admin?.is_staff) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const list = await getRandomPlayerConfig();
    return res.status(200).json(list);
  }

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const admin = await getCustomAuthUserById(userId);
  if (!admin?.is_superuser || !admin?.is_staff) {
    return res.status(403).json({ error: "Admin access required" });
  }

  if (req.method === "POST") {
    const { on_off, stake, names, wallet, number_of_players } = req.body as {
      on_off?: boolean;
      stake?: number;
      names?: string[];
      wallet?: number;
      number_of_players?: number;
    };
    const rp = await saveRandomPlayerConfig("create", {
      on_off,
      stake,
      names,
      wallet,
      number_of_players,
    });
    return res.status(201).json(rp);
  }

  if (req.method === "PUT") {
    const { id, on_off, stake, names, wallet, number_of_players } = req.body as {
      id: number;
      on_off?: boolean;
      stake?: number;
      names?: string[];
      wallet?: number;
      number_of_players?: number;
    };
    if (id == null) {
      return res.status(400).json({ error: "id is required" });
    }
    const rp = await saveRandomPlayerConfig("update", {
      id,
      on_off,
      stake,
      names,
      wallet,
      number_of_players,
    });
    return res.status(200).json(rp);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
