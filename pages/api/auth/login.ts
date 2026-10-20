import type { NextApiRequest, NextApiResponse } from "next";
import { AuthServiceError, loginUser } from "@/lib/auth/application/auth-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { phone_number, password } = req.body ?? {};

    console.log("[AUTH] login: request received", {
      phone_number: phone_number?.trim() ? `${phone_number.trim().slice(0, 4)}***` : null,
      hasPassword: !!password,
    });

    return res.status(200).json(await loginUser({ phone_number, password }));
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return res.status(err.status).json({ error: err.message, ...(err.payload ?? {}) });
    }
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
