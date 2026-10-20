-- Optional demo seed (run AFTER weekly_bingo.sql)
-- Adjust starts_at to a future time you want the game to run.

INSERT INTO weekly_edition (
  id,
  title,
  stake,
  pattern,
  starts_at,
  registration_opens_at,
  registration_closes_at,
  bot_count,
  bot_wallet,
  bot_wallet_remaining,
  bot_names,
  bot_fill_hours_before_start,
  max_cards_per_user,
  house_cut_percent,
  status
) VALUES (
  'weekly_demo_001',
  'Weekly Bingo — Demo Week',
  10,
  1,
  NOW() + INTERVAL '3 days',
  NOW(),
  NOW() + INTERVAL '3 days',
  50,
  100000,
  100000,
  '["Abebe","Kebede","Tigist","Hanna","Dawit","Mimi","Samuel","Liya","Yonas","Sara","Beki","Helen","Jonas","Ruth","Mekdes"]'::jsonb,
  12,
  1,
  15,
  'open'
) ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  registration_opens_at = EXCLUDED.registration_opens_at,
  registration_closes_at = EXCLUDED.registration_closes_at,
  bot_wallet = EXCLUDED.bot_wallet,
  bot_wallet_remaining = EXCLUDED.bot_wallet_remaining,
  updated_at = NOW();
