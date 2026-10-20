import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { getPublicProfile, ProfileServiceError, updatePublicProfile } from "@/lib/auth/application/profile-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.query.access as string | undefined;
  const userId = token ? verifyAccessToken(token) : null;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    if (req.method === "GET") return res.status(200).json(await getPublicProfile(userId));
    return res.status(200).json(await updatePublicProfile(userId, req.body?.name));
  } catch (error) {
    if (error instanceof ProfileServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }
}
