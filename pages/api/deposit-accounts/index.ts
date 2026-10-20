import type { NextApiRequest, NextApiResponse } from "next";
import { listDepositAccounts } from "@/lib/payments/application/payment-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    try {
        return res.status(200).json(await listDepositAccounts());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed to fetch accounts" });
    }
}
