import { createPaymentHandler } from "@/lib/payments/api-handler";
import { getTransactionHistory } from "@/lib/payments/application/payment-service";

export default createPaymentHandler(
  "GET",
  "use-error-message",
  (userId, req) => getTransactionHistory(userId, req.query)
);
