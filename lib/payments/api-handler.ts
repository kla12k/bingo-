import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { PaymentServiceError } from "@/lib/payments/application/payment-service";

type PaymentAction = (userId: string, request: NextApiRequest) => Promise<unknown>;

export function createPaymentHandler(
  method: string,
  fallbackMessage: string,
  action: PaymentAction
) {
  return async function paymentHandler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== method) return res.status(405).json({ error: "Method not allowed" });

    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
      return res.status(200).json(await action(userId, req));
    } catch (error) {
      console.error(error);
      if (error instanceof PaymentServiceError) {
        return res
          .status(error.status)
          .json({ error: error.message, ...(error.payload ?? {}) });
      }
      return res.status(500).json({
        error: error instanceof Error && fallbackMessage === "use-error-message"
          ? error.message
          : fallbackMessage,
      });
    }
  };
}