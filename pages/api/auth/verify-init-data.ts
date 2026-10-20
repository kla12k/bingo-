import type { NextApiRequest, NextApiResponse } from 'next';
import {
    authenticateTelegramInitData,
    TelegramAuthError,
} from "@/lib/auth/application/telegram-auth-service";

type VerifyInitDataRequest = {
    initData: string;
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        return res.status(200).json(
            await authenticateTelegramInitData((req.body as VerifyInitDataRequest)?.initData)
        );
    } catch (error) {
        if (error instanceof TelegramAuthError) {
            return res.status(error.status).json({ error: error.message, ...(error.payload ?? {}) });
        }
        console.error('Telegram verification error:', error);
        return res.status(500).json({ error: 'Internal server error during Telegram verification' });
    }
}
