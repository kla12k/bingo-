import type { NextApiRequest, NextApiResponse } from "next";
import { AuthServiceError, refreshUserTokens } from "@/lib/auth/application/auth-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body ?? {};
    return res.status(200).json(refreshUserTokens(body.refresh ?? body.refresh_token));
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Token refresh error:", err);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
}
