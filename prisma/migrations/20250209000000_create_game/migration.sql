-- CreateTable: game (required for later migrations; no-op if already exists)
CREATE TABLE IF NOT EXISTS "game" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "stake" INTEGER NOT NULL DEFAULT 0,
    "stakeCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "calledNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "playerCard" JSONB,
    "randomNumbers" JSONB,
    "winnerPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adminCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winner" JSONB,
    "winnerName" TEXT,
    "winnerCard" INTEGER,

    CONSTRAINT "game_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_code_key" ON "game"("code");
CREATE INDEX IF NOT EXISTS "game_status_stake_idx" ON "game"("status", "stake");
