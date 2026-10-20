import { createPaymentHandler } from "@/lib/payments/api-handler";
import { submitAutoDeposit } from "@/lib/payments/application/payment-service";

export default createPaymentHandler(
  "POST",
  "use-error-message",
  (userId, req) => submitAutoDeposit(userId, req.body ?? {})
);
