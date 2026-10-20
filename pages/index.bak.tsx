import Link from "next/link";
import Head from "next/head";

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Bingo Platform</title>
        <meta name="description" content="Real-time multiplayer bingo" />
      </Head>
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Bingo
          </h1>
          <p className="text-[var(--muted)] mb-10">
            Create a game or join with a code. Real-time, no sign-up.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/create"
              className="rounded-xl bg-[var(--accent)] text-white px-6 py-3 font-medium hover:bg-[var(--accent-hover)] transition"
            >
              Creatdddddddde game
            </Link>
            <Link
              href="/join"
              className="rounded-xl border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--surface)] transition"
            >
              Join with code
            </Link>
            <Link
              href="/browse"
              className="rounded-xl border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--surface)] transition"
            >
              Browse by stake
            </Link>
            <Link
              href="/stake"
              className="rounded-xl border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--surface)] transition"
            >
              Stake rooms
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
