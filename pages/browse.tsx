import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { formatStake } from "@/lib/stake";

const CURRENCIES = ["USD", "EUR", "GBP", "tokens"] as const;

type GameRow = {
  id: string;
  code: string;
  name: string;
  stake: number;
  stakeCurrency: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
};

export default function BrowseGamesPage() {
  const [stakeFilter, setStakeFilter] = useState<string>("");
  const [stakeCurrency, setStakeCurrency] = useState<string>("USD");
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("status", "waiting");
    if (stakeFilter !== "") {
      const num = parseFloat(stakeFilter);
      if (!Number.isNaN(num) && num >= 0) {
        params.set("stake", stakeFilter);
        params.set("stakeCurrency", stakeCurrency);
      }
    }
    setLoading(true);
    fetch(`/api/v2/games?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load games");
        return res.json();
      })
      .then(setGames)
      .catch(() => setError("Failed to load games"))
      .finally(() => setLoading(false));
  }, [stakeFilter, stakeCurrency]);

  return (
    <>
      <Head>
        <title>Browse games — Bingo</title>
      </Head>
      <main className="min-h-screen p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Browse games by stake</h1>
            <Link
              href="/"
              className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
            >
              ← Home
            </Link>
          </div>

          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 mb-6">
            <label className="block text-sm text-[var(--muted)] mb-2">
              Stake (filter games by entry stake)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                min={0}
                step={stakeCurrency === "tokens" ? 1 : 0.01}
                value={stakeFilter}
                onChange={(e) => setStakeFilter(e.target.value)}
                placeholder={stakeCurrency === "tokens" ? "0" : "0.00"}
                className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-4 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <select
                value={stakeCurrency}
                onChange={(e) => setStakeCurrency(e.target.value)}
                className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setStakeFilter("0")}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--border)] transition"
              >
                Free only
              </button>
            </div>
          </div>

          {error && (
            <p className="text-error text-sm mb-4">{error}</p>
          )}

          {loading ? (
            <p className="text-[var(--muted)]">Loading…</p>
          ) : games.length === 0 ? (
            <p className="text-[var(--muted)]">
              No waiting games found for this stake. Try another value or create a game.
            </p>
          ) : (
            <ul className="space-y-3">
              {games.map((g) => (
                <li
                  key={g.id}
                  className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center justify-between flex-wrap gap-2"
                >
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Stake: {formatStake(g.stake, g.stakeCurrency)} · {g.playerCount}/{g.maxPlayers} players · Code: {g.code}
                    </p>
                  </div>
                  <Link
                    href={`/game/${g.code}`}
                    className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 text-sm font-medium hover:bg-[var(--accent-hover)] transition"
                  >
                    Join
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
