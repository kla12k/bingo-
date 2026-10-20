-- Weekly Bingo tables (run manually — no prisma db push required)
-- PostgreSQL

BEGIN;

CREATE TABLE IF NOT EXISTS weekly_edition (
  id                          TEXT PRIMARY KEY,
  title                       VARCHAR(255) NOT NULL,
  stake                       DOUBLE PRECISION NOT NULL DEFAULT 10,
  pattern                     INTEGER NOT NULL DEFAULT 1,
  starts_at                   TIMESTAMPTZ NOT NULL,
  registration_opens_at       TIMESTAMPTZ NOT NULL,
  registration_closes_at      TIMESTAMPTZ NOT NULL,
  bot_count                   INTEGER NOT NULL DEFAULT 200,
  bot_wallet                  DOUBLE PRECISION NOT NULL DEFAULT 500000,
  bot_wallet_remaining        DOUBLE PRECISION NOT NULL DEFAULT 500000,
  bot_names                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  bot_fill_hours_before_start INTEGER NOT NULL DEFAULT 12,
  max_cards_per_user          INTEGER NOT NULL DEFAULT 1,
  house_cut_percent           DOUBLE PRECISION NOT NULL DEFAULT 15,
  status                      VARCHAR(32) NOT NULL DEFAULT 'draft',
  prize_pool                  DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner_price                DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner_user_ids             TEXT[] NOT NULL DEFAULT '{}',
  winner_card_ids             INTEGER[] NOT NULL DEFAULT '{}',
  winner_names                TEXT[] NOT NULL DEFAULT '{}',
  called_numbers              INTEGER[] NOT NULL DEFAULT '{}',
  random_numbers              JSONB,
  player_meta                 JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS weekly_edition_status_starts_idx
  ON weekly_edition (status, starts_at);

CREATE TABLE IF NOT EXISTS weekly_participant (
  id              TEXT PRIMARY KEY,
  edition_id      TEXT NOT NULL REFERENCES weekly_edition(id) ON DELETE CASCADE,
  user_id         TEXT,
  is_bot          BOOLEAN NOT NULL DEFAULT FALSE,
  bot_slot        INTEGER,
  display_name    VARCHAR(255) NOT NULL DEFAULT 'Player',
  player_code     VARCHAR(64),
  card_ids        INTEGER[] NOT NULL DEFAULT '{}',
  entry_fee_paid  DOUBLE PRECISION NOT NULL DEFAULT 0,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_participant_edition_user_unique UNIQUE (edition_id, user_id)
);

CREATE INDEX IF NOT EXISTS weekly_participant_edition_idx
  ON weekly_participant (edition_id);

CREATE INDEX IF NOT EXISTS weekly_participant_edition_bot_slot_idx
  ON weekly_participant (edition_id, bot_slot);

-- Optional: sample open edition (edit dates before running in prod)
-- Uncomment to seed a test weekly game:
/*
INSERT INTO weekly_edition (
  id, title, stake, pattern,
  starts_at, registration_opens_at, registration_closes_at,
  bot_count, bot_wallet, bot_wallet_remaining,
  bot_names, bot_fill_hours_before_start, max_cards_per_user,
  house_cut_percent, status
) VALUES (
  'weekly_demo_001',
  'Weekly Bingo — Demo Week',
  10,
  1,
  NOW() + INTERVAL '7 days',
  NOW(),
  NOW() + INTERVAL '7 days',
  50,
  100000,
  100000,
  '["Abebe","Kebede","Tigist","Hanna","Dawit","Mimi","Samuel","Liya","Yonas","Sara"]'::jsonb,
  12,
  1,
  15,
  'open'
) ON CONFLICT (id) DO NOTHING;
*/

COMMIT;
