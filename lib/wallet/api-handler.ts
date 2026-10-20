import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAccessToken } from "@/lib/custom-auth";
import { TransferServiceError } from "@/lib/wallet/application/transfer-service";

export async function handleWalletTransfer(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const { transferWalletBalance } = await import("@/lib/wallet/application/transfer-service");
    return res.status(200).json(await transferWalletBalance(userId, req.body ?? {}));
  } catch (error) {
    console.error(error);
    if (error instanceof TransferServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to process transfer" });
  }
}