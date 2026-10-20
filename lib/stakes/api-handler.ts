import type { NextApiRequest, NextApiResponse } from "next";
import { StakeServiceError } from "@/lib/stakes/application/stake-service";

type StakeAction = (req: NextApiRequest) => Promise<unknown>;

export function createStakeHandler(methods: Record<string, StakeAction>) {
  return async function stakeHandler(req: NextApiRequest, res: NextApiResponse) {
    const action = req.method ? methods[req.method] : undefined;
    if (!action) {
      res.setHeader("Allow", Object.keys(methods));
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
    try {
      const result = await action(req);
      if (req.method === "DELETE") return res.status(204).end();
      return res.status(req.method === "POST" ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof StakeServiceError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Request failed" });
    }
  };
}