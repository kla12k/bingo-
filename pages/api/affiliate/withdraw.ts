import { createAffiliateHandler } from "@/lib/affiliate/api-handler";
import { createAffiliateWithdrawal } from "@/lib/affiliate/application/affiliate-service";

export default createAffiliateHandler(
  "POST",
  "Failed to create withdrawal request",
  (userId, req) => createAffiliateWithdrawal(userId, req.body ?? {}),
  201
);
