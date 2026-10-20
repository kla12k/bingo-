-- Bot leaderboard: store bot participations + per-game bot identity on Game.player_meta
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "player_meta" JSONB;

CREATE TABLE IF NOT EXISTS "game_botgameparticipation" (
    "id" TEXT NOT NULL,
    "player_code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "amount_won" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "times_played" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_botgameparticipation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_botgameparticipation_player_code_game_id_key"
    ON "game_botgameparticipation"("player_code", "game_id");
CREATE INDEX IF NOT EXISTS "game_botgameparticipation_player_code_idx"
    ON "game_botgameparticipation"("player_code");
CREATE INDEX IF NOT EXISTS "game_botgameparticipation_game_id_idx"
    ON "game_botgameparticipation"("game_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'game_botgameparticipation_game_id_fkey'
    ) THEN
        ALTER TABLE "game_botgameparticipation"
            ADD CONSTRAINT "game_botgameparticipation_game_id_fkey"
            FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
