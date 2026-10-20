-- Bot accounting: human/bot admin-cut split on games + wallet top-up audit log.
-- Run manually against PostgreSQL (no prisma db push):
--   psql "$DATABASE_URL" -f prisma/migrations/manual_bot_accounting.sql

ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "human_admin_cut" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "bot_admin_cut" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "human_card_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "bot_card_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "random_player_wallet_topup" (
    "id" SERIAL NOT NULL,
    "random_player_id" INTEGER NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance_before" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance_after" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topup_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT 'cron_below_threshold',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "random_player_wallet_topup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "random_player_wallet_topup_random_player_id_idx"
    ON "random_player_wallet_topup"("random_player_id");
CREATE INDEX IF NOT EXISTS "random_player_wallet_topup_created_at_idx"
    ON "random_player_wallet_topup"("created_at");
