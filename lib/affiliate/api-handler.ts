import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { AffiliateServiceError } from "@/lib/affiliate/application/affiliate-service";

type AffiliateAction = (
  userId: string,
  request: NextApiRequest
) => Promise<unknown>;

export function createAffiliateHandler(
  method: string,
  fallbackMessage: string,
  action: AffiliateAction,
  successStatus = 200,
  errorPayload?: (error: unknown, fallbackMessage: string) => Record<string, unknown>
) {
  return async function affiliateHandler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== method) return res.status(405).json({ error: "Method not allowed" });

    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const userId = token ? verifyAccessToken(token) : null;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    try {
      return res.status(successStatus).json(await action(userId, req));
    } catch (error) {
      console.error(error);
      if (error instanceof AffiliateServiceError) {
        return res.status(error.status).json({
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      return res.status(500).json(
        errorPayload?.(error, fallbackMessage) ?? { error: fallbackMessage }
      );
    }
  };
}