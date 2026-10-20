-- CreateTable
CREATE TABLE "stake_config" (
    "id" SERIAL NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "has_bonus" BOOLEAN NOT NULL DEFAULT false,
    "bones_min_players" INTEGER NOT NULL DEFAULT 10,
    "bonus_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stake_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stake_config_amount_key" ON "stake_config"("amount");
