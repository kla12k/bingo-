-- Manual migration: coupon + coupon_claim tables.
-- Run this SQL manually (e.g. psql or your DB client). Then run: npx prisma generate

CREATE TABLE IF NOT EXISTS "coupon" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "description" VARCHAR(500),
  "reward_type" TEXT DEFAULT 'bonus',
  "reward_value" DOUBLE PRECISION DEFAULT 0,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "max_claims" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "coupon_claim" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coupon_id" TEXT NOT NULL REFERENCES "coupon"("id") ON DELETE CASCADE,
  "user_id" BIGINT NOT NULL,
  "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("coupon_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "coupon_claim_user_id_idx" ON "coupon_claim"("user_id");
CREATE INDEX IF NOT EXISTS "coupon_claim_coupon_id_idx" ON "coupon_claim"("coupon_id");
