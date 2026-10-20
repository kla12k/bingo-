-- Add array columns for multiple winners
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "winnerNames" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "winnerCards" INTEGER[] NOT NULL DEFAULT '{}';

-- Backfill from single winnerName/winnerCard (if columns exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game' AND column_name = 'winnerName') THEN
    UPDATE "game"
    SET "winnerNames" = CASE WHEN "winnerName" IS NOT NULL AND "winnerName" != '' THEN ARRAY["winnerName"] ELSE '{}' END
    WHERE "winnerName" IS NOT NULL AND "winnerName" != '';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game' AND column_name = 'winnerCard') THEN
    UPDATE "game"
    SET "winnerCards" = CASE WHEN "winnerCard" IS NOT NULL THEN ARRAY["winnerCard"] ELSE '{}' END
    WHERE "winnerCard" IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game' AND column_name = 'winnerName') THEN
    ALTER TABLE "game" DROP COLUMN "winnerName";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game' AND column_name = 'winnerCard') THEN
    ALTER TABLE "game" DROP COLUMN "winnerCard";
  END IF;
END $$;
