import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import { pageTitle, BRAND } from "@/lib/brand";
import { getSocket } from "@/lib/socket";
import { formatStake } from "@/lib/stake";

type Card = {
  id: string;
  card: number[][];
  marked: number[];
};

type Player = {
  id: string;
  nickname: string;
  cards?: Card[];
};

type Game = {
  id: string;
  code: string;
  name: string;
  status: string;
  stake?: number;
  stakeCurrency?: string;
  players: Player[];
  calledNumbers?: number[];
};

type Winner = { playerId: string; cardId: string; nickname: string };

export default function GamePage() {
  const router = useRouter();
  const code = String(router.query?.code ?? "").toUpperCase();
  const isHost = router.query.host === "1";

  const [nickname, setNickname] = useState("");
  const [numCards, setNumCards] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [player, setPlayer] = useState<Player & { cards?: Card[] } | null>(null);
  const [error, setError] = useState("");
  const [called, setCalled] = useState<number[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);

  const socket = getSocket();

  const joinGame = useCallback(() => {
    if (!nickname.trim() || !code) return;
    setError("");
    socket.emit("join_game", {
      gameCode: code,
      nickname: nickname.trim(),
      numCards: Math.min(6, Math.max(1, numCards)),
    });
  }, [code, nickname, numCards, socket]);

  const addCard = useCallback(() => {
    if (!player?.id || !code) return;
    socket.emit("add_card", { gameCode: code, playerId: player.id });
  }, [code, player?.id, socket]);

  useEffect(() => {
    if (!code) return;

    socket.on(
      "joined",
      (data: { game: Game; player: Player & { cards?: Card[] } }) => {
        setGame(data.game);
        setPlayer(data.player);
        setSubmitted(true);
        setCalled((data.game as Game & { calledNumbers?: number[] }).calledNumbers ?? []);
        setWinners([]);
      }
    );

    socket.on("card_added", (data: { card: Card; game: Game }) => {
      setPlayer((p) =>
        p ? { ...p, cards: [...(p.cards ?? []), data.card] } : null
      );
      setGame(data.game);
    });

    socket.on("player_joined", (data: { game: Game }) => {
      setGame(data.game);
    });

    socket.on("player_cards_updated", (data: { game: Game; playerId: string }) => {
      setGame(data.game);
      if (data.playerId === player?.id) {
        setPlayer((p) => {
          const updated = data.game.players.find((pl) => pl.id === data.playerId);
          return updated ? { ...p!, ...updated } : p;
        });
      }
    });

    socket.on("player_left", () => {
      setGame((g) => (g ? { ...g, players: g.players } : null));
    });

    socket.on("game_started", (data: { called: number[] }) => {
      setCalled(data.called ?? []);
      setGame((g) => (g ? { ...g, status: "playing" } : null));
    });

    socket.on("number_called", (data: { number: number; called: number[] }) => {
      setCalled(data.called ?? []);
    });

    socket.on(
      "player_marked",
      (data: { playerId: string; cardId: string; number: number; marked: number[] }) => {
        if (data.playerId !== player?.id) return;
        setPlayer((p) => {
          if (!p?.cards) return p;
          return {
            ...p,
            cards: p.cards.map((c) =>
              c.id === data.cardId ? { ...c, marked: data.marked } : c
            ),
          };
        });
      }
    );

    socket.on("bingo_claimed", (data: { winners: Winner[] }) => {
      setWinners(data.winners);
    });

    socket.on("bingo_winners", (data: { winners: Winner[] }) => {
      setWinners(data.winners);
      setGame((g) => (g ? { ...g, status: "finished" } : null));
    });

    socket.on("error", (data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      socket.off("joined");
      socket.off("card_added");
      socket.off("player_joined");
      socket.off("player_cards_updated");
      socket.off("player_left");
      socket.off("game_started");
      socket.off("number_called");
      socket.off("player_marked");
      socket.off("bingo_claimed");
      socket.off("bingo_winners");
      socket.off("error");
    };
  }, [code, player?.id]);

  const startGame = () => {
    socket.emit("start_game", { gameCode: code });
  };

  const callNumber = () => {
    socket.emit("call_number", { gameCode: code });
  };

  const markNumber = (cardId: string, num: number) => {
    if (!player?.id || game?.status !== "playing") return;
    socket.emit("mark_number", {
      gameCode: code,
      playerId: player.id,
      cardId,
      number: num,
    });
  };

  const claimBingo = (cardId: string) => {
    if (!player?.id) return;
    socket.emit("bingo", { gameCode: code, playerId: player.id, cardId });
  };

  function hasBingo(card: Card): boolean {
    if (!card?.card?.length || !card.marked?.length) return false;
    const marked = new Set(card.marked);
    const rows = card.card;
    const cols = Array.from({ length: 5 }, (_, c) => rows.map((r) => r[c]));
    const diag1 = [rows[0][0], rows[1][1], rows[2][2], rows[3][3], rows[4][4]];
    const diag2 = [rows[0][4], rows[1][3], rows[2][2], rows[3][1], rows[4][0]];
    const lines = [...rows, ...cols, diag1, diag2];
    return lines.some((line) => line.every((n) => marked.has(n)));
  }

  if (router.isFallback || !code) {
    return (
      <main className="min-h-screen p-6">
        <p className="text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  if (!submitted) {
    return (
      <>
        <Head>
          <title>{pageTitle(`Join game ${code}`)}</title>
        </Head>
        <main className="min-h-screen flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold mb-2">Join game {code}</h1>
            <p className="text-[var(--muted)] mb-4">
              Enter your nickname and how many cards (cartelle) you want.
            </p>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="mb-3">
              <label className="block text-sm text-[var(--muted)] mb-1">
                Number of cards (1–6)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={numCards}
                onChange={(e) =>
                  setNumCards(Math.min(6, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
                className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            {error && <p className="text-error text-sm mb-2">{error}</p>}
            <button
              onClick={joinGame}
              className="w-full rounded-xl bg-[var(--accent)] text-white py-3 font-medium hover:bg-[var(--accent-hover)] transition"
            >
              Join
            </button>
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

  const isPlaying = game?.status === "playing";
  const isFinished = game?.status === "finished";
  const isWaiting = game?.status === "waiting";
  const playerCards = player?.cards ?? [];
  const canAddCard = isWaiting && playerCards.length < 6 && player?.id;

  return (
    <>
      <Head>
        <title>{pageTitle(game?.name ?? BRAND.name)}</title>
      </Head>
      <main className="min-h-screen p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{game?.name ?? "Bingo"}</h1>
              <p className="text-[var(--muted)] text-sm">
                Code: {code}
                {game?.stake != null && (
                  <> · Stake: {formatStake(game.stake, game.stakeCurrency ?? "USD")}</>
                )}
              </p>
            </div>
            <a href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
              Leave
            </a>
          </div>

          {isHost && isWaiting && (
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 mb-4">
              <p className="text-sm text-[var(--muted)] mb-2">
                {game?.players?.length ?? 0} player(s),{" "}
                {game?.players?.reduce((s, p) => s + (p.cards?.length ?? 0), 0) ?? 0} card(s). Need
                at least 2 players and 2 cards to start.
              </p>
              <button
                onClick={startGame}
                disabled={
                  (game?.players?.length ?? 0) < 2 ||
                  (game?.players?.reduce((s, p) => s + (p.cards?.length ?? 0), 0) ?? 0) < 2
                }
                className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 font-medium disabled:opacity-50 hover:bg-[var(--accent-hover)] transition"
              >
                Start game
              </button>
            </div>
          )}

          {isHost && isPlaying && (
            <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 mb-4">
              <button
                onClick={callNumber}
                className="rounded-lg bg-[var(--accent)] text-white px-4 py-2 font-medium hover:bg-[var(--accent-hover)] transition"
              >
                Call next number
              </button>
            </div>
          )}

          {called.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-[var(--muted)] mb-1">Last called</p>
              <p className="text-3xl font-bold text-[var(--accent)]">
                {called[called.length - 1]}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">All: {called.join(", ")}</p>
            </div>
          )}

          {winners.length > 0 && (
            <div className="rounded-xl bg-[var(--bingo)]/20 border border-[var(--bingo)] p-4 mb-4">
              <p className="font-bold text-[var(--bingo)] mb-1">
                {isFinished ? "Winners" : "Bingo claimed (waiting for more…)"}
              </p>
              <ul className="list-disc list-inside text-sm">
                {winners.map((w, i) => (
                  <li key={`${w.playerId}-${w.cardId}-${i}`}>
                    {w.nickname}
                    {w.playerId === player?.id && " (you)"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-[var(--muted)]">Your cards (cartelle)</p>
            {canAddCard && (
              <button
                onClick={addCard}
                className="text-sm rounded-lg border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)] transition"
              >
                + Add card
              </button>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {playerCards.map((card) => {
              const markedSet = new Set(card.marked ?? []);
              const thisHasBingo = hasBingo(card);
              return (
                <div
                  key={card.id}
                  className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4"
                >
                  <p className="text-sm text-[var(--muted)] mb-3">Card</p>
                  <div className="grid grid-cols-5 gap-1 max-w-[280px] mx-auto">
                    {card.card.map((row, ri) =>
                      row.map((num, ci) => (
                        <button
                          key={`${card.id}-${ri}-${ci}`}
                          type="button"
                          onClick={() => markNumber(card.id, num)}
                          disabled={!isPlaying || isFinished}
                          className={`aspect-square rounded-lg border text-lg font-semibold transition ${
                            markedSet.has(num)
                              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                              : "bg-[var(--bg)] border-[var(--border)] hover:border-[var(--accent)]"
                          } ${ri === 2 && ci === 2 ? "opacity-70" : ""}`}
                        >
                          {ri === 2 && ci === 2 ? "★" : num}
                        </button>
                      ))
                    )}
                  </div>
                  {isPlaying && thisHasBingo && (
                    <button
                      onClick={() => claimBingo(card.id)}
                      className="mt-4 w-full rounded-lg bg-[var(--bingo)] text-black font-bold py-2 hover:opacity-90 transition"
                    >
                      BINGO!
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-4 mt-6">
            <p className="text-sm text-[var(--muted)] mb-2">
              Players ({game?.players?.length ?? 0})
            </p>
            <ul className="space-y-1">
              {(game?.players ?? []).map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  {p.nickname}
                  {p.cards?.length ? (
                    <span className="text-xs text-[var(--muted)]">
                      ({p.cards.length} card{p.cards.length !== 1 ? "s" : ""})
                    </span>
                  ) : null}
                  {p.id === player?.id && (
                    <span className="text-xs text-[var(--muted)]">(you)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isFinished && (
            <p className="mt-4 text-center text-[var(--success)] font-medium">
              Game over. {winners.length > 1 ? "Winners" : "Winner"}:{" "}
              {winners.map((w) => w.nickname).join(", ")}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
