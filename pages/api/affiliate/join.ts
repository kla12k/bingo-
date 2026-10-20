import type { NextApiRequest, NextApiResponse } from "next";
import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { joinAffiliateProgram } from "@/lib/affiliate/application/affiliate-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const baseHandler = createAffiliateHandler(
    "POST",
    "Failed to join affiliate program",
    (userId) => joinAffiliateProgram(userId)
  );
  return baseHandler(req, res);
}
