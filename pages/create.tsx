import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const CURRENCIES = ["USD", "EUR", "GBP", "tokens"] as const;

export default function CreateGamePage() {
  const [name, setName] = useState("");
  const [stake, setStake] = useState(0);
  const [stakeCurrency, setStakeCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Game name is required");
      return;
    }
    if (stake < 0) {
      setError("Stake cannot be negative");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v2/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          stake: Math.round(stake),
          stakeCurrency: stakeCurrency || "USD",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create game");
      router.push(`/game/${data.code}?host=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Create game — Bingo</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6">Create a game</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm text-[var(--muted)] mb-1">
                Game name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Friday night bingo"
                className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="stake" className="block text-sm text-[var(--muted)] mb-1">
                  Stake (entry amount)
                </label>
                <input
                  id="stake"
                  type="number"
                  min={0}
                  step={stakeCurrency === "tokens" ? 1 : 0.01}
                  value={stake === 0 ? "" : stake}
                  onChange={(e) => setStake(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div>
                <label htmlFor="currency" className="block text-sm text-[var(--muted)] mb-1">
                  Currency
                </label>
                <select
                  id="currency"
                  value={stakeCurrency}
                  onChange={(e) => setStakeCurrency(e.target.value)}
                  className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Players will see this stake when joining. Use 0 for free games.
            </p>
            {error && <p className="text-error text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--accent)] text-white py-3 font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition"
            >
              {loading ? "Creating…" : "Create game"}
            </button>
          </form>
          <p className="mt-4 text-center">
            <a href="/" className="text-[var(--muted)] hover:text-[var(--text)] text-sm">
              ← Back home
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
