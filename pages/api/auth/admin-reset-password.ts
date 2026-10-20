import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { AuthServiceError, resetUserPassword } from "@/lib/auth/application/auth-service";

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
    return res.status(200).json(await resetUserPassword(adminId, req.body ?? {}));
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
}
