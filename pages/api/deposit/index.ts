import { createPaymentHandler } from "@/lib/payments/api-handler";
import { submitDeposit } from "@/lib/payments/application/payment-service";

export default createPaymentHandler(
  "POST",
  "use-error-message",
  (userId, req) => submitDeposit(userId, req.body ?? {})
);
