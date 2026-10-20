import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { getAffiliateWithdrawHistory } from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler(
  "GET",
  "Failed to fetch withdrawal history",
  (userId, req) =>
    getAffiliateWithdrawHistory(userId, req.query as Record<string, string | undefined>)
);
