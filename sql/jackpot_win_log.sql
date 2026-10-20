-- Jackpot win history (run manually — no prisma db push required)
-- PostgreSQL

BEGIN;

CREATE TABLE IF NOT EXISTS jackpot_win_log (
  id                       TEXT PRIMARY KEY,
  game_id                  TEXT NOT NULL UNIQUE,
  stake                    DOUBLE PRECISION NOT NULL,
  jackpot_limit            DOUBLE PRECISION NOT NULL DEFAULT 0,
  pool_before              DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_awarded           DOUBLE PRECISION NOT NULL DEFAULT 0,
  contribution_from_game   DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner_user_ids          TEXT[] NOT NULL DEFAULT '{}',
  winner_names             TEXT[] NOT NULL DEFAULT '{}',
  winner_card_ids          INTEGER[] NOT NULL DEFAULT '{}',
  call_count               INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jackpot_win_log_stake_created_idx
  ON jackpot_win_log (stake, created_at DESC);

CREATE INDEX IF NOT EXISTS jackpot_win_log_created_idx
  ON jackpot_win_log (created_at DESC);

COMMIT;

-- Optional: backfill from existing games that already paid a jackpot
INSERT INTO jackpot_win_log (
  id, game_id, stake, jackpot_limit, pool_before, amount_awarded,
  contribution_from_game, winner_user_ids, winner_names, winner_card_ids,
  call_count, created_at
)
SELECT
  gen_random_uuid()::text,
  g.id,
  g.stake::double precision,
  g.jackpot_awarded,
  g.jackpot_awarded,
  g.jackpot_awarded,
  COALESCE(g.jackpot_deducted_from_admin_cut, 0),
  COALESCE(
    (SELECT array_agg(x) FROM jsonb_array_elements_text(g.winner) AS t(x)),
    '{}'::text[]
  ),
  COALESCE(g."winnerNames", '{}'),
  COALESCE(g."winnerCards", '{}'),
  COALESCE(array_length(g."calledNumbers", 1), 0),
  g."createdAt"
FROM game g
WHERE g.jackpot_awarded > 0
ON CONFLICT (game_id) DO NOTHING;
