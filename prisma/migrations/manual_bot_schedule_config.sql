-- Bot schedule config (time-of-day bot card counts, EAT).
-- Run manually: psql "$DATABASE_URL" -f prisma/migrations/manual_bot_schedule_config.sql

CREATE TABLE IF NOT EXISTS "bot_schedule_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "slots" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_schedule_config_pkey" PRIMARY KEY ("id")
);

-- Default schedule (same as lib/bot-schedule.ts defaults)
INSERT INTO "bot_schedule_config" ("id", "slots")
VALUES (
    1,
    '[
      {"id":"late_night","label":"00:00–03:00","startMinutes":0,"endMinutes":180,"mode":"absolute","min":12,"max":20},
      {"id":"early_morning","label":"03:00–08:00","startMinutes":180,"endMinutes":480,"mode":"absolute","min":5,"max":10},
      {"id":"morning","label":"08:00–12:00","startMinutes":480,"endMinutes":720,"mode":"absolute","min":5,"max":10},
      {"id":"afternoon","label":"12:00–15:00","startMinutes":720,"endMinutes":900,"mode":"absolute","min":10,"max":15},
      {"id":"peak","label":"15:00–00:00","startMinutes":900,"endMinutes":1440,"mode":"base_plus_extra","min":1,"max":20}
    ]'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
