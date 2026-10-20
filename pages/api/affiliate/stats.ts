import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { getAffiliateStats } from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler("GET", "Failed to fetch affiliate stats", (userId) =>
  getAffiliateStats(userId)
);
