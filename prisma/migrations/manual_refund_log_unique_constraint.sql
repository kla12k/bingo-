-- Migration: add unique constraint on refund_log(gameId, userId)
-- Purpose: Prevent duplicate refunds for the same game+user at the database level.
--          This is the atomic guard against the race condition where multiple
--          concurrent server processes issue a refund for the same game before
--          any of them has committed, causing 2x-12x refunds per game.
--
-- Safe to run: the application already cleaned up all duplicate rows before this
-- constraint was added, so no existing data will violate it.

CREATE UNIQUE INDEX IF NOT EXISTS refund_log_game_user_unique
    ON refund_log ("gameId", "userId");
