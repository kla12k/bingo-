import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { getAffiliateTransactions } from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler(
  "GET",
  "Failed to fetch affiliate transactions",
  (userId, req) =>
    getAffiliateTransactions(userId, req.query as Record<string, string | undefined>)
);
