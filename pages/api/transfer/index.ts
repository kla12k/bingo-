import type { NextApiRequest, NextApiResponse } from "next";
import { handleWalletTransfer } from "@/lib/wallet/api-handler";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleWalletTransfer(req, res);
}
