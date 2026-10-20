import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { pageTitle } from "@/lib/brand";
import { formatStake } from "@/lib/stake";

type GamePreview = {
  code: string;
  name: string;
  stake: number;
  stakeCurrency: string;
  maxPlayers: number;
  players: { id: string }[];
};

export default function JoinGamePage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<GamePreview | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPreview(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a game code");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/games/${trimmed}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Game not found");
      }
      const game: GamePreview = await res.json();
      setPreview(game);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function confirmJoin() {
    if (preview?.code) router.push(`/game/${preview.code}`);
  }

  return (
    <>
      <Head>
        <title>{pageTitle("Join game")}</title>
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6">Join a game</h1>
          {!preview ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-sm text-[var(--muted)] mb-1">
                  Game code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC12"
                  maxLength={10}
                  className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 uppercase focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              {error && <p className="text-error text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[var(--accent)] text-white py-3 font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition"
              >
                {loading ? "Checking…" : "Find game"}
              </button>
            </form>
          ) : (
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 space-y-4">
              <p className="font-medium">{preview.name}</p>
              <p className="text-sm text-[var(--muted)]">
                Stake: <strong>{formatStake(preview.stake, preview.stakeCurrency)}</strong>
              </p>
              <p className="text-sm text-[var(--muted)]">
                {preview.players.length} / {preview.maxPlayers} players
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="flex-1 rounded-lg border border-[var(--border)] py-2 font-medium hover:bg-[var(--bg)] transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmJoin}
                  className="flex-1 rounded-xl bg-[var(--accent)] text-white py-2 font-medium hover:bg-[var(--accent-hover)] transition"
                >
                  Join game
                </button>
              </div>
            </div>
          )}
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
