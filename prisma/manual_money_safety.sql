-- Money-safety schema for the stake rooms and Weekly Bingo.
-- Apply per brand database, the same way the coupon tables were added by hand:
--
--   docker exec -i main-service-postgres-1 \
--     psql -U postgres -d faya-bingo < prisma/manual_money_safety.sql
--
-- Everything here is idempotent and safe to re-run. The app probes for these
-- objects and degrades to the old (less precise) refund behaviour when they are
-- missing, so applying this is what turns exactly-once refunds on.

BEGIN;

-- 1. What each player actually paid, split by funding source, so a refund can
--    return bonus to bonus instead of turning promotional balance into cash.
CREATE TABLE IF NOT EXISTS game_charge (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  amount      DOUBLE PRECISION NOT NULL,
  wallet_part DOUBLE PRECISION NOT NULL DEFAULT 0,
  bonus_part  DOUBLE PRECISION NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL DEFAULT 'stake_game',
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS game_charge_game_user_key
  ON game_charge (game_id, user_id);
CREATE INDEX IF NOT EXISTS game_charge_user_id_idx
  ON game_charge (user_id);

-- 2. Settle marker on the game: the conditional UPDATE against refunded_at is the
--    claim that guarantees only one caller refunds a round.
ALTER TABLE game ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMP(3);
ALTER TABLE game ADD COLUMN IF NOT EXISTS refund_reason  TEXT;

CREATE INDEX IF NOT EXISTS game_unrefunded_idx
  ON game (status, refunded_at);

-- 3. refund_log must exist (some brand bootstraps never created it) and needs the
--    unique key that makes a second refund insert a no-op instead of a double credit.
CREATE TABLE IF NOT EXISTS refund_log (
  id          TEXT PRIMARY KEY,
  "gameId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  amount      DOUBLE PRECISION NOT NULL,
  reason      TEXT NOT NULL DEFAULT 'stuck_game',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS refund_log_gameId_idx    ON refund_log ("gameId");
CREATE INDEX IF NOT EXISTS refund_log_userId_idx    ON refund_log ("userId");
CREATE INDEX IF NOT EXISTS refund_log_createdAt_idx ON refund_log ("createdAt");

-- Collapse any pre-existing duplicate refunds before adding the unique key,
-- keeping the earliest row per (game, user, reason). This deletes only duplicate
-- log rows; no balances are touched.
DELETE FROM refund_log r
 WHERE r.ctid <> (
   SELECT k.ctid
     FROM refund_log k
    WHERE k."gameId" = r."gameId"
      AND k."userId" = r."userId"
      AND k.reason   = r.reason
    ORDER BY k."createdAt" ASC, k.ctid ASC
    LIMIT 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS refund_log_game_user_reason_key
  ON refund_log ("gameId", "userId", reason);

-- 4. Append-only money trail for forensics (never read for balances).
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  delta      DOUBLE PRECISION NOT NULL,
  kind       TEXT NOT NULL,
  ref_type   TEXT,
  ref_id     TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx
  ON wallet_ledger (user_id, created_at DESC);

COMMIT;
