-- Set open/locked weekly editions to 200 bots (run manually — no prisma db push)
-- Safe to re-run.

UPDATE weekly_edition
SET
  bot_count = 200,
  updated_at = NOW()
WHERE status IN ('open', 'locked', 'draft');
