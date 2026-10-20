# Candy Bingo — database setup (manual SQL, no `prisma db push`)

Run these against your PostgreSQL database in order:

```bash
# 1. Weekly bingo tables (edition + participants)
psql "$DATABASE_URL" -f sql/weekly_bingo.sql

# 2. Weekly card pool (500 unique cards)
psql "$DATABASE_URL" -f sql/weekly_bingo_cards.sql

# 3. Seed first edition (optional — or use insert_next_sunday)
psql "$DATABASE_URL" -f sql/weekly_bingo_seed.sql
```

## Other useful scripts

| File | Purpose |
|------|---------|
| `sql/weekly_bingo_insert_next_sunday.sql` | Create next Sunday edition (200 bots) |
| `sql/weekly_bingo_set_bots_200.sql` | Set open editions to 200 bots |
| `sql/weekly_bingo_test_5min.sql` | Quick test edition (5 min) |
| `scripts/generate-weekly-cards.ts` | Regenerate `weekly_bingo_cards.sql` (`npm run weekly:cards`) |

After SQL changes:

```bash
npx prisma generate
```

Restart the socket server so weekly cron and handlers load.
