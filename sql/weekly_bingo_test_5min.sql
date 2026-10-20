-- Quick test: registration opens in 2 min, game starts in 5 min
-- Run in psql against your DB, then restart socket server (or wait for cron).

UPDATE weekly_edition
SET
  status = 'open',
  registration_opens_at = NOW() + INTERVAL '2 minutes',
  registration_closes_at  = NOW() + INTERVAL '5 minutes',
  starts_at               = NOW() + INTERVAL '5 minutes',
  bot_wallet_remaining    = bot_wallet,
  updated_at              = NOW()
WHERE id = 'weekly_demo_001';

-- Optional: clear players so you can re-join fresh
-- DELETE FROM weekly_participant WHERE edition_id = 'weekly_demo_001';

SELECT
  id,
  status,
  registration_opens_at,
  registration_closes_at,
  starts_at,
  NOW() AS db_now
FROM weekly_edition
WHERE id = 'weekly_demo_001';
