-- Per-stake bot schedule overrides.
-- If a stake has a row here its own slots are used; otherwise falls back to global bot_schedule_config.
-- Run manually: psql "$DATABASE_URL" -f prisma/migrations/manual_bot_schedule_stake_override.sql

CREATE TABLE IF NOT EXISTS "bot_schedule_stake_override" (
    "stake"      INTEGER      NOT NULL,
    "slots"      JSONB        NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_schedule_stake_override_pkey" PRIMARY KEY ("stake")
);
