/**
 * Generates sql/weekly_bingo_cards.sql with 500 unique weekly bingo cards.
 * Run: npx tsx scripts/generate-weekly-cards.ts
 * Apply: psql $DATABASE_URL -f sql/weekly_bingo_cards.sql
 * (No prisma db push.)
 */
import fs from "fs";
import path from "path";
import { generateCardWithFreeSpace } from "../lib/bingo";

const COUNT = 500;
const outPath = path.join(__dirname, "..", "sql", "weekly_bingo_cards.sql");

const existing = new Set<string>();
const cards: number[][][] = [];
let attempts = 0;

while (cards.length < COUNT && attempts < 100_000) {
  attempts++;
  const card = generateCardWithFreeSpace();
  const key = JSON.stringify(card);
  if (existing.has(key)) continue;
  existing.add(key);
  cards.push(card);
}

if (cards.length < COUNT) {
  console.error(`Only generated ${cards.length}/${COUNT} unique cards`);
  process.exit(1);
}

const values = cards
  .map((c, i) => `  (${i + 1}, '${JSON.stringify(c)}'::jsonb)`)
  .join(",\n");

const sql = `-- Weekly Bingo card pool (run manually — no prisma db push)
-- PostgreSQL — ${COUNT} unique cards
-- Apply: psql "$DATABASE_URL" -f sql/weekly_bingo_cards.sql

BEGIN;

CREATE TABLE IF NOT EXISTS weekly_game_card (
  id      BIGSERIAL PRIMARY KEY,
  numbers JSONB NOT NULL
);

-- Clear and reseed (safe to re-run)
TRUNCATE TABLE weekly_game_card RESTART IDENTITY;

INSERT INTO weekly_game_card (id, numbers) VALUES
${values};

SELECT setval(pg_get_serial_sequence('weekly_game_card', 'id'), ${COUNT});

COMMIT;
`;

fs.writeFileSync(outPath, sql, "utf8");
console.log(`Wrote ${cards.length} cards → ${outPath}`);
