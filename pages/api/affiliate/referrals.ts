import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { getAffiliateReferrals } from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler("GET", "Failed to fetch referrals", (userId, req) =>
  getAffiliateReferrals(userId, req.query as Record<string, string | undefined>)
);
