import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import {
  AffiliateServiceError,
  getReferredUserDeposits,
} from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler(
  "GET",
  "Failed to fetch user deposit history",
  (userId, req) => {
    const targetUserId = req.query.userId;
    if (typeof targetUserId !== "string" || !targetUserId) {
      throw new AffiliateServiceError(400, "Target User ID is required");
    }
    return getReferredUserDeposits(userId, targetUserId);
  }
);
