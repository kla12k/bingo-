import type { NextApiRequest, NextApiResponse } from "next";
import { AuthServiceError, registerUser } from "@/lib/auth/application/auth-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    return res.status(201).json(await registerUser(req.body ?? {}));
  } catch (err: any) {
    if (err instanceof AuthServiceError) {
      return res.status(err.status).json(err.payload ?? { error: err.message });
    }
    if (err?.message === "Phone number already in use") {
      return res.status(400).json({ error: "Phone number already in use" });
    }
    if (err?.message?.includes("Phone Number")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Registration error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
