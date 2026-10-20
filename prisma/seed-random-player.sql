-- Sample INSERT for RandomPlayer table
-- Table name: "RandomPlayer" (Prisma default)
-- Adjust table name if your DB uses different casing (e.g. random_player)

INSERT INTO "RandomPlayer" (on_off, stake, names, wallet, number_of_players)
VALUES
  (true, 10, '["Lucky", "BingoBot", "Daisy", "Jack"]', 5000, 5),
  (true, 20, '["Max", "Bella", "Charlie"]', 10000, 3),
  (false, 50, '[]', 0, 0);
