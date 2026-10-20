import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { toRowMajorNumbers, hasBingo, getBingoLetter } from "@/lib/bingo";
import { playAudio } from "@/utils/audioCache";
import toast from "react-hot-toast";
import { toastOnce, toastErrorOnce } from "@/utils/toast-once";
import Head from "next/head";
import Link from "next/link";
import BingoCard from "@/components/BingoCard";
import NumberList from "@/components/NumberList";
import { Button } from "@/components/ui/button";
import { useUser } from "@/api/session";
import { pageTitle } from "@/lib/brand";
import PlayGameHeader from "@/components/PlayGameHeader";
import WinnerPopup from "@/components/WinnerPop";
type GameStat = {
  running?: boolean;
  number_of_players?: number;
  player_count?: number;
  stake?: number;
  game_id?: string | number;
  game_number?: number | string;
  winner_price?: number;
  bonus?: string;
  called_numbers?: number[];
  remaining_seconds?: number;
  show_auto_select_button?: boolean;
  showAutoSelectButton?: boolean;
};

type WinnerInfo = {
  pattern: number[][];
  highlightPositions: number[];
  name: string;
  card_id: string;
  user_id: string;
  bones_won?: number;
  amount_won?: number;
  jackpot_won_total?: number;
  showJackpotAnimation?: boolean;
  x_bonus_won_total?: number;
  x_scenario?: string;
  showXAnimation?: boolean;
};


type BingoCard = {
  id: number;
  numbers: number[][];
};
function flatToRowCol(pos: number): { r: number; c: number } {
  const p = Math.max(1, Math.min(25, Number(pos)));
  const r = Math.floor((p - 1) / 5);
  const c = (p - 1) % 5;
  return { r, c };
}

/** Return a unique pattern label from winning positions (1-25). */
function getPatternLabel(positions: number[]): string {
  const set = new Set(positions.map(Number));
  if (set.size === 0) return "Bingo";
  const rows = [0, 1, 2, 3, 4].filter((r) => [1, 2, 3, 4, 5].every((k) => set.has(r * 5 + k)));
  const cols = [0, 1, 2, 3, 4].filter((c) => [0, 1, 2, 3, 4].every((r) => set.has(r * 5 + c + 1)));
  const diag1 = [0, 1, 2, 3, 4].every((i) => set.has(i * 5 + i + 1));
  const diag2 = [0, 1, 2, 3, 4].every((i) => set.has(i * 5 + (4 - i) + 1));
  const corners = [1, 5, 21, 25].every((p) => set.has(p));
  const inner = [7, 9, 17, 19].every((p) => set.has(p));
  if (rows.length > 0) return `Row ${rows[0] + 1}`;
  if (cols.length > 0) return `Column ${cols[0] + 1}`;
  if (diag1 && diag2) return "Both Diagonals";
  if (diag1) return "Diagonal \\";
  if (diag2) return "Diagonal /";
  if (corners) return "4 Corners";
  if (inner) return "4 Inner Corners";
  return "Bingo";
}

const USER_DATA_KEY = "user";

type UserData = {
  id: string;
  name: string;
  phone_number?: string;
  wallet: number;
  bonus?: number;
  telegram_id?: string;
  is_affiliate?: boolean;
};

function getOrCreateUser(): UserData {
  if (typeof window === "undefined") return { id: "anon", name: "Guest", wallet: 0, bonus: 0 };
  const data = sessionStorage.getItem(USER_DATA_KEY);
  if (data) {
    try {
      const parsed = JSON.parse(data) as UserData;
      if (parsed?.id != null) return { ...parsed, wallet: parsed.wallet ?? 0, bonus: parsed.bonus ?? 0 };
    } catch (_e) { }
  }
  const id = "user_" + Math.random().toString(36).slice(2, 12);
  const newUser: UserData = {
    id,
    name: `User ${id.slice(5, 10)}`,
    wallet: 0,
    bonus: 0,
  };
  sessionStorage.setItem(USER_DATA_KEY, JSON.stringify(newUser));
  return newUser;
}


// Number board: 15 rows × 5 cols. Col 0=B(1-15), Col 1=I(16-30), Col 2=N(31-45), Col 3=G(46-60), Col 4=O(61-75)
const ALL_NUMBERS = Array.from({ length: 15 }, (_, row) =>
  [row + 1, row + 16, row + 31, row + 46, row + 61]
).flat();

/* BINGO letter colors from theme.css: B=blue, I=green, N=purple, G=red, O=yellow */
const LETTER_COLORS: Record<string, { bg: string; text: string; calledBg: string }> = {
  B: { bg: "bg-[var(--bingo-b)]", text: "text-white", calledBg: "bg-[var(--bingo-b-called)]" },
  I: { bg: "bg-[var(--bingo-i)]", text: "text-white", calledBg: "bg-[var(--bingo-i-called)]" },
  N: { bg: "bg-[var(--bingo-n)]", text: "text-white", calledBg: "bg-[var(--bingo-n-called)]" },
  G: { bg: "bg-[var(--bingo-g)]", text: "text-white", calledBg: "bg-[var(--bingo-g-called)]" },
  O: { bg: "bg-[var(--bingo-o)]", text: "text-[var(--bingo-o-text)]", calledBg: "bg-[var(--bingo-o-called)]" },
};

/** Returns true if the card has any complete row, column, or diagonal in markedSet. markedSet = numbers considered daubed (include 0 for free). */
function cardHasBingo(card: BingoCard, markedSet: Set<number>): boolean {
  const flat = card.numbers.flat();
  const idx = (r: number, c: number) => r * 5 + c;
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => markedSet.has(flat[idx(r, c)]))) return true;
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => markedSet.has(flat[idx(r, c)]))) return true;
  }
  if ([0, 1, 2, 3, 4].every((i) => markedSet.has(flat[i * 5 + i]))) return true;
  if ([0, 1, 2, 3, 4].every((i) => markedSet.has(flat[i * 5 + (4 - i)]))) return true;
  return false;
}

export default function PlayPage() {
  const router = useRouter();
  const { stake: stakeParam } = router.query;
  const stake = typeof stakeParam === "string" ? parseInt(stakeParam, 10) : NaN;
  const [user, setUser] = useState<UserData>({ id: "anon", name: "Guest", wallet: 0 });
  const { displayReference, toggleDisplayReference } = useUser();
  const [gameId, setGameId] = useState<string | null>(null);
  const [stat, setStat] = useState<GameStat | null>(null);
  const [cardData, setCardData] = useState<BingoCard[]>([]);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [bingoAttempts, setBingoAttempts] = useState(0);
  const [winners, setWinners] = useState<WinnerInfo[]>([]);
  const [showWinners, setShowWinners] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);

  // Load audio preferences from localStorage (English only)
  useEffect(() => {
    const saved = localStorage.getItem("BINGO_AUDIO_PREF");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.muted === "boolean") setMuted(parsed.muted);
      } catch (e) {
        console.error("Failed to parse audio preference", e);
      }
    }
    setIsAudioLoaded(true);
  }, []);

  // Persist audio preferences to localStorage
  useEffect(() => {
    if (isAudioLoaded) {
      localStorage.setItem("BINGO_AUDIO_PREF", JSON.stringify({ muted, language: "en" }));
    }
  }, [muted, isAudioLoaded]);

  const [autoBingo, setAutoBingo] = useState(true);
  const [showAutoSelectButton, setShowAutoSelectButton] = useState(true);

  // Fetch GameConfig settings (showAutoSelectButton)
  useEffect(() => {
    fetch("/api/v2/game-config")
      .then((res) => res.json())
      .then((cfg) => {
        if (typeof cfg?.showAutoSelectButton === "boolean") {
          setShowAutoSelectButton(cfg.showAutoSelectButton);
          if (!cfg.showAutoSelectButton) {
            setAutoBingo(false);
          }
        }
      })
      .catch((err) => console.error("Failed to load /api/v2/game-config:", err));
  }, []);
  const [userMarked, setUserMarked] = useState<Record<number, Set<number>>>({});
  const [reconnecting, setReconnecting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const hasAutoSubmittedRef = useRef(false);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const lastSpokenNumberRef = useRef<number | null>(null);
  const lastSocketActivityRef = useRef(Date.now());
  const staleRefreshInFlightRef = useRef(false);
  const showWinnersRef = useRef(false);
  const cardDataRef = useRef<BingoCard[]>([]);
  const gameEndRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGameIdRef = useRef<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isStakeValid = !Number.isNaN(stake) && stake > 0;
  // useEffect(() => {

  //   const testWinners = [
  //     {
  //       user_id:"4",
  //       name: "Brook",
  //       card_id: "81",
  //       amount_won: 120,
  //       card: [
  //         [5, 18, 31, 57, 65],
  //         [10, 24, 37, 46, 72],
  //         [2, 22, 0, 53, 66], // 0 = free space
  //         [8, 29, 38, 59, 68],
  //         [14, 19, 33, 51, 70],
  //       ],
  //       winning_numbers: [1, 7, 13, 19, 25],
  //     },
  //     {
  //       user_id: "9",
  //       name: "Sam",
  //       card_id: "92",
  //       amount_won: 120,
  //       card: [
  //         [2, 20, 37, 49, 72],
  //         [14, 19, 33, 46, 70],
  //         [1, 18, 0, 57, 65],
  //         [10, 24, 34, 53, 68],
  //         [4, 22, 31, 59, 66],
  //       ],
  //       winning_numbers: [5, 9, 13, 17, 21],
  //     },
  //     {
  //       user_id: "15",
  //       name: "Hanna",
  //       card_id: "104",
  //       amount_won: 120,
  //       card: [
  //         [1, 18, 31, 49, 65],
  //         [14, 22, 33, 46, 70],
  //         [2, 20, 0, 53, 66],
  //         [10, 24, 34, 57, 68],
  //         [5, 19, 37, 59, 72],
  //       ],
  //       winning_numbers: [1, 2, 3, 4, 5],
  //     },
  //   ];

  //   // 🔁 Format EXACTLY like socket → frontend expects
  //   const formattedWinners = testWinners.map((r) => ({
  //     pattern: r.card,
  //     highlightPositions: r.winning_numbers,
  //     name: r.name,
  //     card_id: r.card_id,
  //     user_id: r.user_id,
  //     amount_won: r.amount_won,
  //   }));

  //   // ✅ Push into grid modal
  //   setWinners(formattedWinners);
  //   setShowWinners(true);

  //   console.log("🧪 DEV MODE: Test winners loaded", formattedWinners);
  // }, []); // runs once
  const speakNumber = useCallback(
    (number: number) => {
      if (muted) return;
      const letter = getBingoLetter(number);
      playAudio(`/audio/${letter}-${number}.mp3`);
    },
    [muted]
  );

  useEffect(() => {
    setUser(getOrCreateUser());
  }, []);

  useEffect(() => {
    hasAutoSubmittedRef.current = false;
    lastSpokenNumberRef.current = null;
    setUserMarked({});
  }, [gameId]);

  // Keep userMarked in sync with calledNumbers whenever autoBingo is active so turning Auto Play off retains marked numbers
  useEffect(() => {
    if (!autoBingo || calledNumbers.length === 0 || cardData.length === 0) return;
    setUserMarked((prev) => {
      const next = { ...prev };
      cardData.forEach((card) => {
        const cardSet = new Set(prev[card.id] ?? [0]);
        cardSet.add(0);
        calledNumbers.forEach((num) => cardSet.add(num));
        next[card.id] = cardSet;
      });
      return next;
    });
  }, [autoBingo, calledNumbers, cardData]);


  useEffect(() => {
    activeGameIdRef.current = gameId;
  }, [gameId]);

  useEffect(() => {
    showWinnersRef.current = showWinners;
  }, [showWinners]);

  useEffect(() => {
    cardDataRef.current = cardData;
  }, [cardData]);

  const clearGameEndRedirect = () => {
    if (gameEndRedirectRef.current) {
      clearTimeout(gameEndRedirectRef.current);
      gameEndRedirectRef.current = null;
    }
  };

  const clearResultRedirect = () => {
    if (resultRedirectRef.current) {
      clearTimeout(resultRedirectRef.current);
      resultRedirectRef.current = null;
    }
  };

  const scheduleStakeRedirect = (delayMs: number) => {
    clearResultRedirect();
    resultRedirectRef.current = setTimeout(() => {
      router.push(`/stake/${stake}`);
    }, delayMs);
  };

  useEffect(() => {
    if (!autoBingo || !socketRef.current || !gameId || cardData.length === 0 || hasAutoSubmittedRef.current) return;

    // Check if any card has a bingo pattern using the shared logic
    const anyBingo = cardData.some((card) => hasBingo(card.numbers, [0, ...calledNumbers]) !== null);

    if (anyBingo) {
      hasAutoSubmittedRef.current = true;
      setBingoAttempts((prev) => prev + 1);
      const markedSet = new Set<number>([0, ...calledNumbers]);
      const claims = cardData.map((card) => ({
        card_id: card.id,
        marked_numbers: Array.from(markedSet)
      }));
      socketRef.current.emit("bingo", { user_id: user.id, game_id: gameId, stake, claims });
    }
  }, [autoBingo, calledNumbers, cardData, gameId, user.id, stake]);

  useEffect(() => {
    if (!isStakeValid || user.id === "anon") return;

    const socket = getSocket();
    socketRef.current = socket;

    const touchSocketActivity = () => {
      lastSocketActivityRef.current = Date.now();
    };

    const refetch = () => {
      touchSocketActivity();
      socket.emit("join_stake_room", { stake, user_id: user.id });
      socket.emit("get_stake_stat");
      socket.emit("get_my_cards_for_game", { user_id: user.id, stake });
    };

    const onConnect = () => {
      setWsConnected(true);
      setReconnecting(false);
      refetch();
    };

    const onDisconnect = (reason: string) => {
      setWsConnected(false);
      if (reason === "io server disconnect") setReconnecting(false);
      else setReconnecting(true);
    };

    setWsConnected(socket.connected);
    refetch();

    socket.onAny(touchSocketActivity);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("game_in_progress", (p: { game_id?: string; called_numbers?: number[] }) => {
      if (p.game_id) setGameId(p.game_id);
      if (Array.isArray(p.called_numbers) && p.called_numbers.length > 0) {
        setCalledNumbers(p.called_numbers);
      }
    });

    socket.on("user_data", (data: UserData) => {
      setUser(data);
      sessionStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
    });

    socket.on("game_stat", (s: GameStat) => {
      setStat(s);
      if (s.game_id != null) setGameId(String(s.game_id));
      if (s.called_numbers) setCalledNumbers(s.called_numbers);

      const showAutoVal = s.show_auto_select_button ?? s.showAutoSelectButton;
      if (typeof showAutoVal === "boolean") {
        setShowAutoSelectButton(showAutoVal);
        if (!showAutoVal) {
          setAutoBingo(false);
        }
      }

      if (s.running === false) {
        if (showWinnersRef.current) return;

        // Spectator / lobby poll — not an in-game player seeing game over.
        if (cardDataRef.current.length === 0 && s.game_id == null && s.remaining_seconds != null) return;

        const endedId = s.game_id || activeGameIdRef.current || "last";
        toastErrorOnce(`game-ended-${endedId}`, "Game ended! Redirecting to selection...", {
          id: "game-ended",
        });
        clearGameEndRedirect();
        gameEndRedirectRef.current = setTimeout(() => {
          router.push(`/stake/${stake}`);
        }, 2000);
      }
    });

    socket.on("card_data", (p: { cards: BingoCard[] }) => {
      if (Array.isArray(p?.cards) && p.cards.length > 0) {
        const normalized = p.cards.map((c) => {
          try {
            const raw = typeof c.numbers === "string" ? JSON.parse(c.numbers) : c.numbers;
            return { ...c, numbers: toRowMajorNumbers(raw) };
          } catch (_e) {
            return { ...c, numbers: toRowMajorNumbers(c.numbers) };
          }
        });
        setCardData(normalized);
        setUserMarked((prev) => {
          const next = { ...prev };
          normalized.forEach((c) => {
            if (!(c.id in next)) next[c.id] = new Set();
          });
          return next;
        });
        // toast.success(`${p.cards.length} card(s) loaded!`);
      }
    });


    socket.on("no_cards", () => {
      const gId = gameId || "spectator";
      //toastOnce(`spectator-mode-${gId}`, "Watching as spectator...", { id: "spectator-mode", icon: "👀" });
    });

    socket.on("random_number", (p: { random_number: number; game_id?: string | number }) => {
      if (String(p.game_id) === gameId || !gameId) {
        const num = p.random_number;
        setCalledNumbers((prev) => (prev.includes(num) ? prev : [...prev, num]));
        if (lastSpokenNumberRef.current !== num) {
          lastSpokenNumberRef.current = num;
          speakNumber(num);
        }
      }
    });

    socket.on("result", (data: any) => {
      const results = Array.isArray(data.data) ? data.data : [];
      const bingoWinners = results.filter((r: any) => r.message === "Bingo");
      if (bingoWinners.length === 0) {
        const first = results[0];
        const attempt = first?.invalid_attempt as number | undefined;
        const maxAttempts = first?.max_attempts ?? 3;
        if (typeof attempt === "number") {
          const left = maxAttempts - attempt;
          toast.error(
            left > 0
              ? `Not a Bingo. Invalid attempt ${attempt} of ${maxAttempts}. ${left} attempt${left === 1 ? "" : "s"} left before removal.`
              : `Not a Bingo. Invalid attempt ${attempt} of ${maxAttempts}.`
          );
        } else {
          toast.error("Not a Bingo. Please check your card and try again.");
        }
      } else {
        clearGameEndRedirect();

        const jackpotTotal =
          typeof bingoWinners?.[0]?.jackpot_won_total === "number"
            ? bingoWinners[0].jackpot_won_total
            : Number(bingoWinners?.[0]?.jackpot_won_total ?? 0);

        const xBonusTotal =
          typeof bingoWinners?.[0]?.x_bonus_won_total === "number"
            ? bingoWinners[0].x_bonus_won_total
            : Number(bingoWinners?.[0]?.x_bonus_won_total ?? 0);

        const formattedWinners = bingoWinners
          .map((w: any, idx: number) => {
            let pattern: number[][] = [];
            try {
              const raw = w.card ?? w.numbers;
              if (Array.isArray(raw)) {
                pattern =
                  raw.length === 5 && Array.isArray(raw[0])
                    ? raw.map((row: number[]) => row.map(Number))
                    : toRowMajorNumbers(raw);
              }
            } catch (_e) {
              pattern = [];
            }
            if (pattern.length !== 5) return null;

            return {
              pattern,
              highlightPositions: Array.isArray(w.winning_numbers)
                ? w.winning_numbers.map(Number)
                : [],
              name: String(w.name ?? "Winner"),
              card_id: String(w.card_id ?? ""),
              user_id: String(w.user_id ?? ""),
              bones_won: w.bones_won,
              amount_won: w.amount_won,
              jackpot_won_total: w.jackpot_won_total ?? jackpotTotal,
              showJackpotAnimation: idx === 0 && jackpotTotal > 0,
              x_bonus_won_total: w.x_bonus_won_total ?? xBonusTotal,
              x_scenario: w.x_scenario,
              showXAnimation: idx === 0 && xBonusTotal > 0,
            };
          })
          .filter(Boolean) as WinnerInfo[];

        if (formattedWinners.length === 0) return;

        setWinners(formattedWinners);
        const isMeWinner = formattedWinners.some(
          (w) => String(w.user_id) === String(user.id)
        );
        if (!muted && isMeWinner) {
          // English number calls only; no Amharic UI sting
        }
        showWinnersRef.current = true;
        setShowWinners(true);
        scheduleStakeRedirect(5000);
      }
    });

    socket.on("bingo_claim_pending", (p: {
      message?: string;
      winners_count?: number;
    }) => {
      // toastOnce(
      //   `bingo-pending-${gameId}`,"Checking Winning Card...",
      //   { id: "bingo-pending", icon: "⏳", duration: 3000 }
      // );
    });

    socket.on("bingo_claimed", (p: { winners_count?: number }) => {
      const n = p?.winners_count ?? 0;
      if (n > 1) {
        // toastOnce(
        //   `bingo-multi-${gameId}`,
        //   `${n} players claimed bingo — prize will be split evenly.`,
        //   { id: "bingo-multi", icon: "🎉", duration: 3000 }
        // );
      }
    });

    socket.on("game_terminated", (payload: { reason?: string }) => {
      toast.error(payload?.reason ?? "You have been removed from the game.");
      router.push(`/stake/${stake}`);
    });

    socket.on("player_kicked", (payload: { user_id?: string; reason?: string }) => {
      const uid = payload?.user_id ?? "unknown";
      if (uid !== user.id) {
        // toast(`Player ${String(uid).slice(0, 8)} was removed.`);
      }
    });

    return () => {
      clearGameEndRedirect();
      clearResultRedirect();
      socket.offAny(touchSocketActivity);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game_in_progress");
      socket.off("user_data");
      socket.off("game_stat");
      socket.off("card_data");
      socket.off("no_cards");
      socket.off("random_number");
      socket.off("result");
      socket.off("bingo_claim_pending");
      socket.off("bingo_claimed");
      socket.off("game_terminated");
      socket.off("player_kicked");
    };
  }, [isStakeValid, stake, user.id, gameId, bingoAttempts, speakNumber, router]);

  // Recover when the socket stops receiving events during an active game.
  useEffect(() => {
    if (!isStakeValid || user.id === "anon" || !gameId) return;

    const softRefetch = () => {
      if (staleRefreshInFlightRef.current || showWinnersRef.current) return;
      staleRefreshInFlightRef.current = true;
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("join_stake_room", { stake, user_id: user.id });
        socket.emit("get_stake_stat");
        socket.emit("get_my_cards_for_game", { user_id: user.id, stake });
      }
      window.setTimeout(() => {
        staleRefreshInFlightRef.current = false;
      }, 1500);
    };

    const interval = window.setInterval(() => {
      const socket = socketRef.current;
      if (!socket || showWinnersRef.current) return;

      const idleMs = Date.now() - lastSocketActivityRef.current;

      if (!socket.connected) {
        socket.connect();
        return;
      }

      if (stat?.running !== false && idleMs > 2000) {
        softRefetch();
      }

      if (stat?.running !== false && idleMs > 15000) {
        lastSocketActivityRef.current = Date.now();
        socket.disconnect();
        socket.connect();
      }
    }, 2000);

    const onVisible = () => {
      if (document.visibilityState === "visible") softRefetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isStakeValid, stake, user.id, gameId, stat?.running]);

  const handleSoftRefresh = () => {
    setIsRefreshing(true);
    const socket = socketRef.current;
    if (socket) {
      if (!socket.connected) socket.connect();
      socket.emit("join_stake_room", { stake, user_id: user.id });
      socket.emit("get_stake_stat");
      socket.emit("get_my_cards_for_game", { user_id: user.id, stake });
      lastSocketActivityRef.current = Date.now();
      window.setTimeout(() => setIsRefreshing(false), 1500);
    } else {
      window.location.reload();
    }
  };

  const handleBingoClick = () => {
    if (bingoAttempts >= 3) {
      toast.error("Maximum Bingo attempts reached!");
      return;
    }
    if (!cardData.length || gameId == null) {
      toast.error("No cards or game in progress.");
      return;
    }
    // Send user's held selection per card for server to validate
    const claims = cardData.map((card) => {
      const markedSet = autoBingo
        ? new Set<number>([0, ...calledNumbers])
        : new Set<number>([0, ...(userMarked[card.id] ?? [])]);
      return { card_id: card.id, marked_numbers: Array.from(markedSet) };
    });
    socketRef.current?.emit("bingo", {
      user_id: user.id,
      game_id: gameId,
      stake,
      claims,
    });
    setBingoAttempts((prev) => prev + 1);
  };

  if (!isStakeValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <p className="text-error mb-4">Invalid stake</p>
          <Link href="/stake" className="text-[var(--accent)] underline">
            ← Back to Stakes
          </Link>
        </div>
      </div>
    );
  }

  const recentNumbers = calledNumbers.slice(-4);
  const currentCall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const totalCalls = calledNumbers.filter((n) => n !== 0).length;


  const lastCalled = [...calledNumbers].reverse().find((n) => n > 0) ?? null;
  const recentCalls = calledNumbers.filter((n) => n > 0).slice(-8).reverse();
  const letterOf = (n: number) => getBingoLetter(n);

  return (
    <>
      <Head>
        <title>{pageTitle(`Playing ${stake}`)}</title>
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-[#060B18] text-white">
        {/* Arena atmosphere */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.28),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(34,211,238,0.12),_transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-3 p-2.5 pb-4 md:p-4">
          <PlayGameHeader
            wsConnected={wsConnected}
            reconnecting={reconnecting}
            muted={muted}
            language="en"
            onAudioToggle={() => setMuted((v) => !v)}
            autoBingo={autoBingo}
            onAutoToggle={() => setAutoBingo((v) => !v)}
            showAuto={cardData.length !== 0 && showAutoSelectButton}
            isRefreshing={isRefreshing}
            onRefresh={handleSoftRefresh}
            stat={stat}
            gameId={gameId}
            stake={stake}
            totalCalls={totalCalls}
            lastCalled={lastCalled}
          />

          {/* Call spotlight + recent strip */}
          <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B1224]/80 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#38BDF8] to-[#2563EB] opacity-80 blur-md animate-pulse" />
                <span className="relative flex h-[4.5rem] w-[4.5rem] flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#0EA5E9] via-[#2563EB] to-[#1E3A8A] shadow-[0_0_40px_rgba(37,99,235,0.65)] ring-2 ring-white/20">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                    {lastCalled ? letterOf(lastCalled) : "GO"}
                  </span>
                  <span className="text-2xl font-black tabular-nums leading-none">
                    {lastCalled ?? "—"}
                  </span>
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#64748B]">
                    Call Stream
                  </p>
                  <p className="text-[10px] font-bold text-[#38BDF8]">
                    {totalCalls}/75 drawn
                  </p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {recentCalls.length > 0 ? recentCalls.map((n, i) => (
                    <span
                      key={`${n}-${i}`}
                      className={`flex h-10 min-w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-[11px] font-black tabular-nums ${
                        i === 0
                          ? "border-[#38BDF8] bg-[#1D4ED8] text-white shadow-[0_0_16px_rgba(56,189,248,0.45)]"
                          : "border-white/10 bg-white/5 text-[#CBD5E1]"
                      }`}
                    >
                      <span className="text-[8px] font-bold text-white/50">{letterOf(n)}</span>
                      {n}
                    </span>
                  )) : (
                    <span className="text-xs font-bold text-[#64748B]">Waiting for first call…</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 max-h-[28vh] overflow-y-auto overscroll-contain rounded-2xl border border-white/5 bg-black/20 p-2 no-scrollbar md:max-h-[34vh]">
              <NumberList
                numbers={[ALL_NUMBERS]}
                recent={calledNumbers.slice(-4)}
                picked={calledNumbers}
                handleRecent={() => { }}
              />
            </div>
          </section>

          {/* Bingo action + cards */}
          <section className="flex flex-1 flex-col gap-3">
            <button
              type="button"
              onClick={handleBingoClick}
              disabled={cardData.length === 0}
              className={`relative overflow-hidden rounded-[1.5rem] py-4 text-2xl font-black uppercase tracking-[0.25em] transition-all active:scale-[0.98] ${
                cardData.length === 0
                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/25"
                  : "border border-[#FDE68A]/40 bg-gradient-to-r from-[#F59E0B] via-[#FBBF24] to-[#F97316] text-[#1C1917] shadow-[0_0_40px_rgba(251,191,36,0.45)]"
              }`}
            >
              {cardData.length > 0 && (
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,.35),transparent)] animate-[shine_2.4s_linear_infinite]" />
              )}
              BINGO!
            </button>

            <div className="rounded-[1.75rem] border border-white/10 bg-[#0B1224]/75 p-3 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#64748B]">
                  Your Cards
                </p>
                <p className="text-[10px] font-bold text-[#93C5FD]">
                  {cardData.length} active
                </p>
              </div>
              <div className="flex max-h-[42vh] flex-col items-center gap-4 overflow-y-auto overscroll-contain no-scrollbar">
                {cardData.length > 0 ? (
                  cardData.map((card) => (
                    <div key={card.id} className="flex w-full flex-col items-center">
                      <div className="rounded-2xl p-[1px] bg-gradient-to-br from-[#38BDF8]/60 via-transparent to-[#FBBF24]/40">
                        <div className="rounded-2xl bg-[#0B1224]/90 p-1">
                          <BingoCard
                            numbers={card.numbers}
                            selectedNumbers={autoBingo ? [0, ...calledNumbers] : Array.from(userMarked[card.id] ?? [])}
                            onNumberClick={(num: number) => {
                              if (autoBingo || num === 0) return;
                              setUserMarked((prev) => {
                                const next = { ...prev };
                                const isMarked = prev[card.id]?.has(num);
                                Object.keys(next).forEach((cid) => {
                                  const cardId = Number(cid);
                                  const cardSet = new Set(next[cardId] ?? []);
                                  if (isMarked) cardSet.delete(num);
                                  else cardSet.add(num);
                                  next[cardId] = cardSet;
                                });
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                      <p className="mt-1.5 text-[10px] font-black uppercase tracking-wider text-[#64748B]">
                        Card #{card.id}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm font-bold text-[#64748B]">Loading cards…</p>
                )}
              </div>
            </div>

            <Button
              onClick={() => router.push(`/stake/${stake}`)}
              className="w-full rounded-2xl border border-red-400/20 bg-red-500/10 py-3.5 text-sm font-black uppercase tracking-widest text-red-300 hover:bg-red-500/20"
            >
              Leave Arena
            </Button>
          </section>
        </div>

        {showWinners && winners.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060B18]/80 backdrop-blur-md">
            <div className="max-h-[100vh] w-full max-w-6xl overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {winners.map((winner, index) => (
                  <WinnerPopup
                    key={index}
                    onClick={() => { }}
                    pattern={winner.pattern}
                    name={winner.name}
                    card_id={winner.card_id}
                    user_id={winner.user_id}
                    highlightPositions={winner.highlightPositions}
                    calledNumbers={calledNumbers}
                    bones_won={winner.bones_won}
                    amount_won={winner.amount_won}
                    jackpot_won_total={winner.jackpot_won_total}
                    showJackpotAnimation={winner.showJackpotAnimation}
                    x_bonus_won_total={winner.x_bonus_won_total}
                    x_scenario={winner.x_scenario}
                    showXAnimation={winner.showXAnimation}
                  />
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => {
                    setShowWinners(false);
                    clearResultRedirect();
                    router.push(`/stake/${stake}`);
                  }}
                  className="rounded-2xl bg-gradient-to-r from-[#38BDF8] to-[#2563EB] px-8 py-3 font-black text-white shadow-[0_0_30px_rgba(37,99,235,0.45)]"
                >
                  Play Again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
