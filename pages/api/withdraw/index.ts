import { createPaymentHandler } from "@/lib/payments/api-handler";
import { submitWithdrawal } from "@/lib/payments/application/payment-service";

export default createPaymentHandler(
  "POST",
  "Failed to process withdrawal",
  (userId, req) => submitWithdrawal(userId, req.body ?? {})
);
