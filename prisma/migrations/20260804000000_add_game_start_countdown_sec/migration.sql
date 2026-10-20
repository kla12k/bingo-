-- CreateTable if not exists
CREATE TABLE IF NOT EXISTS "game_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "number_calling_speed_sec" INTEGER NOT NULL DEFAULT 4,
    "game_start_countdown_sec" INTEGER NOT NULL DEFAULT 30,
    "patterns_required" INTEGER NOT NULL DEFAULT 1,
    "max_cards_per_user" INTEGER NOT NULL DEFAULT 5,
    "show_auto_select_button" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_config_pkey" PRIMARY KEY ("id")
);

-- AlterTable to add columns if table already exists
ALTER TABLE "game_config" ADD COLUMN IF NOT EXISTS "game_start_countdown_sec" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "game_config" ADD COLUMN IF NOT EXISTS "patterns_required" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "game_config" ADD COLUMN IF NOT EXISTS "max_cards_per_user" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "game_config" ADD COLUMN IF NOT EXISTS "show_auto_select_button" BOOLEAN NOT NULL DEFAULT true;
