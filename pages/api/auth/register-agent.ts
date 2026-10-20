import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { AuthServiceError, registerAgent } from "@/lib/auth/application/auth-service";

/** Admin-only: Register an agent (is_staff=True, is_superuser=False) */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const adminId = token ? verifyAccessToken(token) : null;

  if (!adminId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    return res.status(201).json(await registerAgent(adminId, req.body ?? {}));
  } catch (err: any) {
    if (err instanceof AuthServiceError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.message === "Phone number already in use") {
      return res.status(400).json({ error: "Phone number already in use" });
    }
    console.error("Agent registration error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
