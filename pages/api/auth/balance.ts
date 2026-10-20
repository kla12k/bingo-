import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { AuthServiceError, getUserBalance } from "@/lib/auth/application/auth-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (req.query.access as string | undefined);
  const userId = token ? verifyAccessToken(token) : (req.query.user_id as string | undefined);

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    return res.status(200).json(await getUserBalance(userId));
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
}
