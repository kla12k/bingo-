ALTER TABLE "game_config" ADD COLUMN IF NOT EXISTS "bot_win_percent" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "game_config" ALTER COLUMN "bot_win_percent" SET DEFAULT 100;
UPDATE "game_config" SET "bot_win_percent" = 100 WHERE "id" = 'default';
