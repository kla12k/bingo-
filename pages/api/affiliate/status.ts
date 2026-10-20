import type { NextApiRequest, NextApiResponse } from "next";
import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { getAffiliateStatus } from "@/lib/affiliate/application/affiliate-service";

const affiliateStatusHandler = createAffiliateHandler(
  "GET",
  "Failed to get affiliate status",
  (userId) => getAffiliateStatus(userId),
  200,
  (_error, fallbackMessage) => ({ error: fallbackMessage, status: false })
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return affiliateStatusHandler(req, res);
}
