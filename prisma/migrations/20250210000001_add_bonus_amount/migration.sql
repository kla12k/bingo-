-- Add bonus amount to game (bones amount)
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0;
