import { useRouter } from "next/router";
import { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";
import { motion } from "framer-motion";
import { getSocket } from "@/lib/socket";
import { useWebSocket } from "@/api/game";
import { useUser } from "@/api/session";
import { BRAND } from "@/lib/brand";
import { toRowMajorNumbers } from "@/lib/bingo";
import { KineticLoader } from "@/components/KineticLoader";
import toast from "react-hot-toast";
import { Suspense } from "react";
import type { ActiveGameInfo } from "@/lib/active-games";
import { FiClock, FiUsers, FiAward, FiZap } from "react-icons/fi";

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

function sameCardIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function extractPlayerCards(player: any): number[] {
  const cards = player?.card ?? player?.card_ids ?? [];
  return Array.isArray(cards) ? cards.map(Number) : [Number(cards)].filter((n) => !isNaN(n));
}

function extractPlayerId(player: any): string {
  return String(player?.user ?? player?.user_id ?? "");
}

function isAuthenticatedUserId(id: string): boolean {
  return /^\d+$/.test(id);
}

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

type GameStat = {
  running?: boolean;
  remaining_seconds?: number;
  stake?: number;
  number_of_players?: number;
  winner_price?: number;
  game_id?: string | number;
  game_number?: number | string;
};

export default function StakeRoomPage() {
  const router = useRouter();
  const { isReconnecting, isConnected } = useWebSocket();
  const { telegram, displayReference, apiRequest } = useUser();
  const { stake: stakeParam } = router.query;
  const routeStake = typeof stakeParam === "string" ? parseInt(stakeParam, 10) : NaN;
  const [selectedStake, setSelectedStake] = useState<number | null>(null);
  const stake = Number.isFinite(routeStake) && routeStake > 0 ? routeStake : selectedStake ?? NaN;
  const [stakeOptions, setStakeOptions] = useState<ActiveGameInfo[]>([]);
  const [cardRange, setCardRange] = useState(0);
  const [cardFilter, setCardFilter] = useState<"open" | "yours" | "taken">("open");
  const [user, setUser] = useState<UserData>({ id: "anon", name: "Guest", wallet: 0 });
  const [userLoaded, setUserLoaded] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [jackpotStats, setJackpotStats] = useState<{
    amount: number;
    jackpot_limit: number;
    left: number;
    leaderName: string | null;
    leaderAmount: number;
  } | null>(null);
  const [jackpotLoading, setJackpotLoading] = useState(false);
  const [stat, setStat] = useState<GameStat | null>(null);
  const [availableIds, setAvailableIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [displaySeconds, setDisplaySeconds] = useState<number | null>(null);

  const endTimeRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewCard, setPreviewCard] = useState<{ id: number; numbers: number[][] } | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const [socketMsgCount, setSocketMsgCount] = useState(0);
  const [takenCardIds, setTakenCardIds] = useState<number[]>([]);
  const [pendingCardIds, setPendingCardIds] = useState<number[]>([]);
  const [playerList, setPlayerList] = useState<any[]>([]);

  const TOTAL_CARDS = 500;
  const isStakeValid = !Number.isNaN(stake) && stake > 0;

  const selectedIdsRef = useRef<number[]>([]);
  const authUserIdRef = useRef<string>("");
  const toggleInFlightRef = useRef(false);
  const pendingConfirmIdsRef = useRef<number[] | null>(null);
  const confirmSeqRef = useRef(0);
  const inFlightSentRef = useRef<number[] | null>(null);
  const inFlightConfirmSeqRef = useRef(0);
  const lastAckedRef = useRef<number[] | null>(null);
  const needsRoomResyncRef = useRef(true);
  const clientOwnsSelectionRef = useRef(false);
  const authReadyRef = useRef(false);
  const playerListRef = useRef<any[]>([]);
  const confirmBatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceLobbyRefreshRef = useRef<() => void>(() => {});
  const wasRunningRef = useRef(false);
  const CONFIRM_BATCH_MS = 200;

  const clearLobbyGridState = useCallback(() => {
    setTakenCardIds([]);
    setPendingCardIds([]);
    setPlayerList([]);
    playerListRef.current = [];
  }, []);

  forceLobbyRefreshRef.current = () => {
    clearLobbyGridState();
    clientOwnsSelectionRef.current = false;
    needsRoomResyncRef.current = true;
    toggleInFlightRef.current = false;
    inFlightSentRef.current = null;
    pendingConfirmIdsRef.current = null;
    lastAckedRef.current = null;
    confirmSeqRef.current += 1;
    clearConfirmBatch();
    setSelectedIds([]);
    selectedIdsRef.current = [];
    const meId = authUserIdRef.current || String(user.id);
    socketRef.current?.emit("join_stake_room", { stake, user_id: meId });
    socketRef.current?.emit("get_stake_stat");
  };

  const softLobbyRefresh = useCallback(() => {
    needsRoomResyncRef.current = true;
    const meId = authUserIdRef.current || String(user.id);
    socketRef.current?.emit("get_stake_stat");
    if (!clientOwnsSelectionRef.current) {
      socketRef.current?.emit("join_stake_room", { stake, user_id: meId });
    }
  }, [stake, user.id]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    playerListRef.current = playerList;
  }, [playerList]);

  useEffect(() => {
    if (!stat?.running || !isStakeValid) return;
    const meId = authUserIdRef.current || String(user.id);
    const myPlayer = playerList.find((pl) => extractPlayerId(pl) === meId);
    const serverCards = myPlayer ? extractPlayerCards(myPlayer) : [];
    const inGame =
      selectedIds.length > 0 ||
      (lastAckedRef.current?.length ?? 0) > 0 ||
      serverCards.length > 0;
    if (inGame) router.push(`/play/${stake}`);
  }, [stat?.running, selectedIds.length, playerList, stake, isStakeValid, router]);


  useEffect(() => {
    if (stat?.running && selectedIds.length === 0) {
      const gId = stat.game_id || "active";
      // toastOnce(`game-in-progress-${gId}`, "A game is currently in progress. You can enter to watch!", {
      //   id: "game-in-progress",
      //   icon: "🎮",
      //   duration: 4000,
      // });
    }
  }, [stat?.running, stat?.game_id, selectedIds.length]);

  function tick() {
    const end = endTimeRef.current;
    if (end == null) {
      setDisplaySeconds((prev) => (prev !== null && prev <= 0 ? prev : null));
      return;
    }
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    setDisplaySeconds(remaining);
    if (remaining <= 0) endTimeRef.current = null;
  }

  useEffect(() => {
    const raw = stat?.remaining_seconds;
    const parsed = Number(raw);
    const serverRemaining = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;

    if (serverRemaining != null) {
      endTimeRef.current = Date.now() + serverRemaining * 1000;
      tick();
    } else {
      endTimeRef.current = null;
      setDisplaySeconds(null);
    }
  }, [stat?.remaining_seconds, stat?.running, socketMsgCount]);

  useEffect(() => {
    tickIntervalRef.current = setInterval(tick, 200);
    return () => { if (tickIntervalRef.current) clearInterval(tickIntervalRef.current); };
  }, []);

  useEffect(() => {
    const initialUser = getOrCreateUser();
    authUserIdRef.current = String(initialUser.id);
    authReadyRef.current = isAuthenticatedUserId(authUserIdRef.current);
    setUser(initialUser);
    setUserLoaded(true);

    // Pre-cache all audio files for the game
    const preloadAudio = async () => {
      const { getBingoLetter } = await import("@/lib/bingo");
      const { cacheAudioFiles } = await import("@/utils/audioCache");

      const audioFiles: string[] = [];
      // English callouts only (1-75)
      for (let i = 1; i <= 75; i++) {
        audioFiles.push(`/audio/${getBingoLetter(i)}-${i}.mp3`);
      }

      cacheAudioFiles(audioFiles);
    };
    preloadAudio();
  }, []);

  // Fetch live wallet+bonus balance from backend so redirects use database state
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await apiRequest("/auth/balance", "GET");
      if (!cancelled && res?.ok) {
        const data = await res.json();
        setLiveBalance(typeof data.balance === "number" ? data.balance : Number(data.balance ?? 0));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  // Fetch per-stake jackpot stats for card-selection UI
  useEffect(() => {
    let cancelled = false;
    if (!isStakeValid) return;

    (async () => {
      setJackpotLoading(true);
      const res = await apiRequest(`/jackpot/${stake}`, "GET");
      if (!cancelled && res?.ok) {
        const data = await res.json();
        setJackpotStats({
          amount: Number(data.amount ?? 0),
          jackpot_limit: Number(data.jackpot_limit ?? 0),
          left: Number(data.left ?? 0),
          leaderName: (data.leaderName ?? null) as string | null,
          leaderAmount: Number(data.leaderAmount ?? 0),
        });
      }
      if (!cancelled) setJackpotLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [apiRequest, isStakeValid, stake]);

  // Redirect to deposit page if live balance (wallet + bonus) is insufficient for this stake.
  // We only enforce this once we actually have a live balance from the API.

  useEffect(() => {
    if (!isStakeValid || !userLoaded) return;
    if (liveBalance == null) return;

    const fallback = (user.wallet ?? 0) + (user.bonus ?? 0);
    const totalBalance =
      liveBalance != null && !Number.isNaN(liveBalance) ? liveBalance : fallback;

    if (stake > 0 && totalBalance < stake) {
      router.replace("/deposit");
    }
  }, [isStakeValid, stake, user.wallet, user.bonus, userLoaded, liveBalance, router]);

  const clearConfirmBatch = () => {
    if (confirmBatchRef.current) {
      clearTimeout(confirmBatchRef.current);
      confirmBatchRef.current = null;
    }
  };

  const emitPendingSelection = (cardIds: number[]) => {
    if (!socketRef.current || !isStakeValid) return;
    socketRef.current.emit("pending_selection", { stake, card_ids: cardIds });
  };

  const sendConfirmNow = (cardIds: number[]) => {
    clearConfirmBatch();
    const unique = Array.from(new Set(cardIds)).filter((n) => n > 0);
    if (unique.length === 0) return;

    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;
    if (!socket.connected) {
      pendingConfirmIdsRef.current = unique;
      socket.connect();
      socket.once("connect", () => {
        sendConfirmNow(pendingConfirmIdsRef.current ?? unique);
      });
      toast("Connecting… confirming cards shortly", { icon: "🔄", duration: 2000 });
      return;
    }

    if (toggleInFlightRef.current) {
      pendingConfirmIdsRef.current = unique;
      return;
    }

    pendingConfirmIdsRef.current = unique;
    inFlightSentRef.current = unique;
    toggleInFlightRef.current = true;
    confirmSeqRef.current += 1;
    inFlightConfirmSeqRef.current = confirmSeqRef.current;
    socket.emit("confirm_cards", {
      stake: String(stake),
      user_id: authUserIdRef.current || user.id,
      card_ids: unique,
    });
  };

  const finishConfirmFlight = () => {
    toggleInFlightRef.current = false;
    inFlightSentRef.current = null;
    const target = pendingConfirmIdsRef.current ?? selectedIdsRef.current;
    if (target.length === 0) return;
    emitPendingSelection(target);
    const acked = lastAckedRef.current;
    if (!acked || !sameCardIds(target, acked)) {
      pendingConfirmIdsRef.current = target;
      sendConfirmNow(target);
    }
  };

  const scheduleConfirm = (cardIds: number[], immediate = false) => {
    if (stat?.running) return;
    pendingConfirmIdsRef.current = cardIds;
    if (toggleInFlightRef.current) return;

    clearConfirmBatch();
    if (immediate) {
      sendConfirmNow(cardIds);
      return;
    }

    confirmBatchRef.current = setTimeout(() => {
      confirmBatchRef.current = null;
      const latest = pendingConfirmIdsRef.current ?? cardIds;
      sendConfirmNow(latest);
    }, CONFIRM_BATCH_MS);
  };

  const resetLocalCardSelection = useCallback(() => {
    clearLobbyGridState();
    clientOwnsSelectionRef.current = false;
    needsRoomResyncRef.current = true;
    toggleInFlightRef.current = false;
    inFlightSentRef.current = null;
    pendingConfirmIdsRef.current = null;
    lastAckedRef.current = null;
    confirmSeqRef.current += 1;
    clearConfirmBatch();
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setPreviewCard(null);
  }, [clearLobbyGridState]);


  useEffect(() => {
    if (!isStakeValid || !userLoaded) return;

    clearLobbyGridState();
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setPreviewCard(null);

    const socket = getSocket();
    socketRef.current = socket;

    needsRoomResyncRef.current = true;
    clientOwnsSelectionRef.current = false;

    const refetch = () => {
      if (!clientOwnsSelectionRef.current) {
        needsRoomResyncRef.current = true;
      }
      socket.emit("join_stake_room", { stake, user_id: authUserIdRef.current || user.id });
      socket.emit("get_stake_stat");
    };

    refetch();

    socket.on("connect", refetch);

    socket.on("user_data", (data: UserData) => {
      authUserIdRef.current = String(data.id);
      authReadyRef.current = isAuthenticatedUserId(authUserIdRef.current);
      setUser(data);
      sessionStorage.setItem(USER_DATA_KEY, JSON.stringify(data));

      // If user already picked cards before auth id arrived, push them to server now.
      const local = selectedIdsRef.current;
      if (local.length > 0 && clientOwnsSelectionRef.current) {
        scheduleConfirm(local, true);
      }
    });

    socket.on("game_stat", (s: GameStat) => {
      if (s.running === false && wasRunningRef.current) {
        resetLocalCardSelection();
        socket.emit("join_stake_room", { stake, user_id: authUserIdRef.current || user.id });
      }
      if (typeof s.running === "boolean") {
        wasRunningRef.current = s.running;
      }
      setStat(s);
      setSocketMsgCount(c => c + 1);
    });

    socket.on("timer_message", (p: { remaining_seconds: number }) => {
      setStat(prev => ({ ...prev, running: false, remaining_seconds: p.remaining_seconds, stake }));
      setSocketMsgCount(c => c + 1);
    });

    socket.on("lobby_reset", (p: { reason?: string; keep_selection?: boolean }) => {
      if (p?.reason === "game_started") {
        // If game_started event was missed, still open play when we had cards.
        const hadCards =
          selectedIdsRef.current.length > 0 || (lastAckedRef.current?.length ?? 0) > 0;
        if (hadCards) void router.push(`/play/${stake}`);
        resetLocalCardSelection();
        return;
      }
      if (p?.keep_selection || p?.reason === "new_round") {
        clearLobbyGridState();
        clientOwnsSelectionRef.current = false;
        needsRoomResyncRef.current = true;
        socketRef.current?.emit("join_stake_room", {
          stake,
          user_id: authUserIdRef.current || user.id,
        });
        socketRef.current?.emit("get_stake_stat");
        return;
      }
      resetLocalCardSelection();
    });

    socket.on("room_pending_cards", (p: { card_ids?: any[] }) => {
      const ids = Array.isArray(p?.card_ids) ? p.card_ids.map(Number) : [];
      setPendingCardIds(ids);
    });

    socket.on("available_card_ids", (p: { card_ids: any[] }) => {
      setAvailableIds(Array.isArray(p?.card_ids) ? p.card_ids.map(Number) : []);
    });

    socket.on("player_list", (p: any) => {
      const list = p?.player_list || p?.players || [];
      if (!Array.isArray(list)) return;

      const meId = authUserIdRef.current || String(user.id);
      let myServerCards: number[] = [];
      const allTaken = list.flatMap((player) => {
        const pId = extractPlayerId(player);
        const cardList = extractPlayerCards(player);
        if (pId === meId) myServerCards = cardList;
        return cardList;
      });

      setTakenCardIds(allTaken);
      setPlayerList(list);

      // After the user clicks any card, only success/remove/kick updates selection —
      // never background player_list (bot sync, reconnect, etc.).
      if (clientOwnsSelectionRef.current) return;

      if (!needsRoomResyncRef.current) return;
      if (!authReadyRef.current || !isAuthenticatedUserId(meId)) return;

      const local = selectedIdsRef.current;
      if (local.length > 0 && myServerCards.length === 0) {
        // Keep local picks until server catches up on first join.
        needsRoomResyncRef.current = false;
        return;
      }

      if (!sameCardIds(myServerCards, local)) {
        setSelectedIds(myServerCards);
        selectedIdsRef.current = myServerCards;
      }
      if (myServerCards.length > 0) {
        lastAckedRef.current = myServerCards;
      }
      needsRoomResyncRef.current = false;
    });

    const redirectToPlayIfJoined = (payload?: { player_list?: any[] }) => {
      const meId = authUserIdRef.current || String(user.id);
      const list = payload?.player_list ?? playerListRef.current;
      const myPlayer = Array.isArray(list)
        ? list.find((pl) => extractPlayerId(pl) === meId)
        : undefined;
      const serverCards = myPlayer ? extractPlayerCards(myPlayer) : [];
      const hasLocal = selectedIdsRef.current.length > 0;
      const hasAcked = (lastAckedRef.current?.length ?? 0) > 0;
      const inGame = hasLocal || hasAcked || serverCards.length > 0;

      if (serverCards.length > 0 && !hasLocal) {
        setSelectedIds(serverCards);
        selectedIdsRef.current = serverCards;
        lastAckedRef.current = serverCards;
      }

      if (inGame) {
        // Navigate immediately — don't wait for lobby_reset which clears selection.
        void router.push(`/play/${stake}`);
      }
    };

    socket.on("game_in_progress", () => {
      redirectToPlayIfJoined();
    });
    socket.on("game_started", (p: any) => {
      // Always try redirect first while selection is still in memory.
      redirectToPlayIfJoined(p);
    });
    socket.on("playing", (p: any) => {
      redirectToPlayIfJoined(p);
    });

    socket.on("pending_selection_expired", () => {
     // toast("Card selection expired. Please select again.", { icon: "ℹ️" });
    });

    socket.on("error", (p: any) => {
      console.error("❌ Socket ERROR:", p);
      const msg = String(p?.message ?? "Error");
      setMessage(msg);

      if (msg.toLowerCase().includes("server busy")) {
        toast.error(msg);
        const ids = pendingConfirmIdsRef.current ?? [...selectedIdsRef.current];
        if (ids.length > 0) {
          const seq = ++confirmSeqRef.current;
          setTimeout(() => {
            if (seq !== confirmSeqRef.current) return;
            sendConfirmNow(ids);
          }, 600);
        } else {
          finishConfirmFlight();
        }
        return;
      }

            const takenMatch = msg.match(/Cards? ([\d,\s]+) already taken/i);
      if (takenMatch && clientOwnsSelectionRef.current) {
        const conflict = takenMatch[1]
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => n > 0);
        const remaining = selectedIdsRef.current.filter((id) => !conflict.includes(id));
        toast.error(msg);
        toggleInFlightRef.current = false;
        inFlightSentRef.current = null;
        confirmSeqRef.current += 1;

        if (remaining.length > 0) {
          setSelectedIds(remaining);
          selectedIdsRef.current = remaining;
          emitPendingSelection(remaining);
          pendingConfirmIdsRef.current = remaining;
          finishConfirmFlight();
          return;
        }

        const prior = lastAckedRef.current;
        if (prior && prior.length > 0 && !prior.some((id) => conflict.includes(id))) {
          setSelectedIds(prior);
          selectedIdsRef.current = prior;
          emitPendingSelection(prior);
          pendingConfirmIdsRef.current = null;
          return;
        }

        setSelectedIds([]);
        selectedIdsRef.current = [];
        emitPendingSelection([]);
        pendingConfirmIdsRef.current = null;
        if (prior?.some((id) => conflict.includes(id))) {
          lastAckedRef.current = null;
        }
        return;
      }

      if (msg.includes("Game already in progress")) {
        clearConfirmBatch();
        toggleInFlightRef.current = false;
        inFlightSentRef.current = null;
        pendingConfirmIdsRef.current = null;
        confirmSeqRef.current += 1;
        const hadCards =
          selectedIdsRef.current.length > 0 || (lastAckedRef.current?.length ?? 0) > 0;
        if (hadCards) {
          void router.push(`/play/${stake}`);
        } else {
          toast(msg, { icon: "⏳", duration: 4000 });
        }
        return;
      }

      pendingConfirmIdsRef.current = null;
      confirmSeqRef.current += 1;
      toast.error(msg);
      toggleInFlightRef.current = false;
      inFlightSentRef.current = null;
      if (!clientOwnsSelectionRef.current) {
        needsRoomResyncRef.current = true;
        socketRef.current?.emit("join_stake_room", { stake, user_id: authUserIdRef.current || user.id });
      }
    });
    socket.on("success", (p: any) => {
      console.log("✅ Socket SUCCESS:", p);
      setMessage(p?.message ?? "OK");
      const confirmed_ids = p?.card_ids || p?.card_id || [];
      const normalizedIds = Array.isArray(confirmed_ids)
        ? confirmed_ids.map(Number)
        : [Number(confirmed_ids)].filter((n) => !isNaN(n));

      const sent = inFlightSentRef.current;
      if (
        !sent ||
        !sameCardIds(normalizedIds, sent) ||
        inFlightConfirmSeqRef.current !== confirmSeqRef.current
      ) {
        finishConfirmFlight();
        return;
      }

      lastAckedRef.current = normalizedIds;
      toggleInFlightRef.current = false;
      inFlightSentRef.current = null;

      const local = selectedIdsRef.current;
      if (!sameCardIds(local, normalizedIds)) {
        pendingConfirmIdsRef.current = local;
        finishConfirmFlight();
        return;
      }

      pendingConfirmIdsRef.current = null;
      setSelectedIds(normalizedIds);
      selectedIdsRef.current = normalizedIds;
      toast.success(
        normalizedIds.length === 1
          ? `Card #${normalizedIds[0]} confirmed`
          : `${normalizedIds.length} cards confirmed`,
        { duration: 2500 }
      );
    });

    socket.on("card_preview", (p: any) => {
      if (p?.numbers) {
        try {
          const raw = typeof p.numbers === "string" ? JSON.parse(p.numbers) : p.numbers;
          const numbers = toRowMajorNumbers(raw);
          if (numbers.length === 5) setPreviewCard({ id: Number(p.card_id), numbers });
        } catch (_e) { /* ignore parse errors */ }
      }
    });

    socket.on("player_removed", (p: { user_id?: string }) => {
      const meId = authUserIdRef.current || String(user.id);
      const uid = p?.user_id;
      if (!uid || String(uid) !== meId) return;

      clientOwnsSelectionRef.current = false;
      toggleInFlightRef.current = false;
      inFlightSentRef.current = null;
      inFlightConfirmSeqRef.current = 0;
      pendingConfirmIdsRef.current = null;
      lastAckedRef.current = null;
      confirmSeqRef.current += 1;
      clearConfirmBatch();
      setSelectedIds([]);
      selectedIdsRef.current = [];
      emitPendingSelection([]);
    });

    socket.on("player_kicked", (p: { user_id?: string }) => {
      const meId = authUserIdRef.current || String(user.id);
      const uid = p?.user_id;
      if (!uid || String(uid) !== meId) return;

      toggleInFlightRef.current = false;
      inFlightSentRef.current = null;
      pendingConfirmIdsRef.current = null;
      lastAckedRef.current = null;
      confirmSeqRef.current += 1;
      clearConfirmBatch();
      setSelectedIds([]);
      selectedIdsRef.current = [];
      toast.error("You were removed from the game.");
      socketRef.current?.emit("get_stake_stat");
    });

    socket.on("timer_reset", (p: { message: string }) => {
      // Use game_number or random ID for timer reset to show it once per wait period
      const waitKey = stat?.game_id || Date.now().toString().slice(0, 7);
      //toastOnce(`timer-reset-${waitKey}`, p.message || "Waiting for more players to join...", { id: "timer-reset", icon: "🕒" });
    });

    return () => {
      socket.off("connect", refetch);
      socket.off("user_data");
      socket.off("game_stat");
      socket.off("player_list");
      socket.off("timer_message");
      socket.off("timer_reset");
      socket.off("lobby_reset");
      socket.off("room_pending_cards");
      socket.off("game_in_progress");
      socket.off("game_started");
      socket.off("playing");
      socket.off("error");
      socket.off("success");
      socket.off("available_card_ids");
      socket.off("card_preview");
      socket.off("player_removed");
      socket.off("player_kicked");
      socket.off("pending_selection_expired");
      clearConfirmBatch();
    };
  }, [isStakeValid, stake, userLoaded, clearLobbyGridState, resetLocalCardSelection]);

  // Re-sync lobby grid when returning from play or switching back to this tab.

  useEffect(() => {
    if (!isStakeValid || !userLoaded) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (clientOwnsSelectionRef.current) softLobbyRefresh();
      else forceLobbyRefreshRef.current();
    };
    const onRoute = (url: string) => {
      if (url.startsWith(`/stake/${stake}`)) forceLobbyRefreshRef.current();
    };

    document.addEventListener("visibilitychange", onVisible);
    router.events.on("routeChangeComplete", onRoute);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      router.events.off("routeChangeComplete", onRoute);
    };
  }, [isStakeValid, stake, userLoaded, router, softLobbyRefresh]);

  const toggleCard = (id: number) => {
    if (stat?.running === true) return;
    clientOwnsSelectionRef.current = true;
    const current = selectedIdsRef.current;
    const isConfirmed = current.includes(id);
    const isTimeUp = (displaySeconds ?? 0) <= 0;
    if (isTimeUp) return;

    if (isConfirmed) {
      const remaining = current.filter((x) => x !== id);
      if (remaining.length === 0) {
        clearConfirmBatch();
        pendingConfirmIdsRef.current = null;
        lastAckedRef.current = null;
        confirmSeqRef.current += 1;
        inFlightConfirmSeqRef.current = 0;
        toggleInFlightRef.current = true;
        inFlightSentRef.current = null;
        setSelectedIds([]);
        selectedIdsRef.current = [];
        emitPendingSelection([]);
        socketRef.current?.emit("remove_number", { userId: authUserIdRef.current || user.id, stake });
      } else {
        setSelectedIds(remaining);
        selectedIdsRef.current = remaining;
        emitPendingSelection(remaining);
        scheduleConfirm(remaining, true);
      }
    } else {
      const next = [...current, id];
      setSelectedIds(next);
      selectedIdsRef.current = next;
      emitPendingSelection(next);
      scheduleConfirm(next, false);
    }

    socketRef.current?.emit("get_card_preview", { card_id: id });
  };

  const clearCardSelection = () => {
    const current = [...selectedIdsRef.current];
    clientOwnsSelectionRef.current = false;
    clearConfirmBatch();
    pendingConfirmIdsRef.current = null;
    lastAckedRef.current = null;
    inFlightSentRef.current = null;
    inFlightConfirmSeqRef.current = 0;
    confirmSeqRef.current += 1;
    emitPendingSelection([]);
    if (current.length > 0) {
      socketRef.current?.emit("remove_number", {
        userId: authUserIdRef.current || user.id,
        stake,
      });
    }
    toggleInFlightRef.current = true;
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setPreviewCard(null);
  };

  const numbersToDisplay = Array.from({ length: TOTAL_CARDS }, (_, index) => index + 1);


  const confirmedCardsCount = playerList.reduce((acc, p) => acc + (Array.isArray(p?.card) ? p.card.length : 0), 0);

  useEffect(() => {
    if (Number.isFinite(routeStake) && routeStake > 0) setSelectedStake(routeStake);
  }, [routeStake]);

  useEffect(() => {
    const socket = getSocket();
    const onActiveStakes = (games: ActiveGameInfo[]) => {
      const list = Array.isArray(games) ? games : [];
      setStakeOptions(list);
      // On /stake with no stake in the URL, default to the first open room
      setSelectedStake((current) => {
        if (current != null && current > 0) return current;
        if (Number.isFinite(routeStake) && routeStake > 0) return routeStake;
        const preferred =
          list.find((g) => !g.is_running && (g.remaining_seconds || 0) > 0) ??
          list.find((g) => !g.is_running) ??
          list[0];
        return preferred?.amount ?? null;
      });
    };
    socket.emit("join_stake_lobby");
    socket.on("active_stakes", onActiveStakes);
    return () => {
      socket.off("active_stakes", onActiveStakes);
    };
  }, [routeStake]);

  const visibleCardNumbers = Array.from({ length: 50 }, (_, index) => cardRange * 50 + index + 1)
    .filter((cardId) => {
      const isSelected = selectedIds.includes(cardId);
      const isUnavailable = (takenCardIds.includes(cardId) || pendingCardIds.includes(cardId)) && !isSelected;
      if (cardFilter === "yours") return isSelected;
      if (cardFilter === "taken") return isUnavailable;
      return !isUnavailable;
    });

  // Show loading when countdown hit 0 but game hasn't started yet (backend processing ~2s)
  // Only show if we actually have enough players to start, to prevent flickering on resets
  const isStartingGame = displaySeconds === 0 && selectedIds.length > 0 && !stat?.running && confirmedCardsCount >= 2;

  useEffect(() => {
    const interval = setInterval(() => {
      if (!socketRef.current?.connected || stat?.running) return;
      socketRef.current.emit("join_stake_room", {
        stake,
        user_id: authUserIdRef.current || user.id,
      });
      socketRef.current.emit("get_stake_stat");
    }, 8000);

    return () => clearInterval(interval);
  }, [stake, user.id, stat?.running, isStakeValid]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (
        socketRef.current &&
        socketRef.current.connected &&
        (displaySeconds === 0 || displaySeconds === null)
      ) {
        socketRef.current.emit("get_stake_stat");
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [displaySeconds, isStakeValid]);

  const isSelectionClosed = stat?.running === true || (displaySeconds ?? 0) <= 0;

  // Push any batched selection to the server before the round starts.
  useEffect(() => {
    if (!isStakeValid || stat?.running) return;
    if (displaySeconds != null && displaySeconds <= 3 && selectedIdsRef.current.length > 0) {
      clearConfirmBatch();
      scheduleConfirm(selectedIdsRef.current, true);
    }
  }, [displaySeconds, isStakeValid, stat?.running]);

  const balance = liveBalance ?? user.wallet + (user.bonus ?? 0);
  const countdown = displaySeconds ?? 0;

  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><KineticLoader variant="orbit" size="md" /></div>}>
      <div className="min-h-screen bg-[#F3F5F9] text-[#0F172A] -mt-5 relative">
        <Head>
          <title>{isStakeValid ? `Live · ${stake} ETB` : `Live · ${BRAND.name}`}</title>
        </Head>

        {isStartingGame && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F3F5F9]/95 backdrop-blur-sm">
            <KineticLoader variant="orbit" size="lg" />
            <p className="mt-4 text-sm font-black uppercase tracking-wider text-[#2563EB]">Starting round…</p>
            <p className="mt-1 text-xs font-bold text-[#94A3B8]">Locking your cards</p>
          </div>
        )}

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-lg space-y-3 px-3 pt-3 pb-4 sm:px-4"
        >
          {/* Top strip — matches Account / Trends / Cashier */}
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
            <div className="flex items-center gap-1.5 text-[#64748B]">
              <span className={`h-2 w-2 rounded-full ${isConnected && !isReconnecting ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} />
              <span>{isConnected && !isReconnecting ? "SERVER LIVE" : isReconnecting ? "RECONNECTING…" : "OFFLINE"}</span>
            </div>
            <div className="font-bold text-[#2563EB]">
              {BRAND.name.toUpperCase()} · LIVE LOBBY
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-sm font-black text-white">
                {BRAND.logoLetter}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-black text-[#2563EB]">{BRAND.name.toUpperCase()}</span>
                  <span className="rounded border border-[#93C5FD] bg-[#EFF6FF] px-1 py-0.5 text-[8px] font-black text-[#2563EB]">PRO</span>
                </div>
                <p className="text-xs font-medium text-[#94A3B8]">Pick a room · tap cards to join</p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2 text-right shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">Balance</p>
              <p className="font-mono text-sm font-black tabular-nums">
                {balance.toFixed(2)} <span className="text-[10px] text-[#64748B]">ETB</span>
              </p>
            </div>
          </div>

          {/* Stake rooms as horizontal chips */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">Stake Rooms</p>
              <p className="text-[10px] font-bold text-[#2563EB]">{stakeOptions.length} open</p>
            </div>
            {stakeOptions.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {stakeOptions.map((option) => {
                  const isSelected = stake === option.amount;
                  const seconds = Math.max(0, Math.floor(option.remaining_seconds || 0));
                  return (
                    <button
                      key={option.amount}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (stake !== option.amount) {
                          setSelectedStake(option.amount);
                          setCardRange(0);
                          setCardFilter("open");
                        }
                      }}
                      className={`min-w-[5.5rem] shrink-0 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                        isSelected
                          ? "border-[#2563EB] bg-[#2563EB] text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
                          : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-[#93C5FD]"
                      }`}
                    >
                      <span className="block text-sm font-black">{option.amount} ETB</span>
                      <span className={`mt-0.5 block text-[9px] font-bold ${isSelected ? "text-white/80" : "text-[#94A3B8]"}`}>
                        {option.is_running ? "Live now" : seconds > 0 ? `0:${String(seconds).padStart(2, "0")}` : "Open"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-xs font-bold text-[#94A3B8]">
                {isStakeValid ? "Loading rooms…" : "Waiting for rooms…"}
              </p>
            )}
          </section>

          {!isStakeValid && (
            <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-6 text-center text-xs font-bold text-[#94A3B8]">
              Choose a stake room to open its card pool.
            </div>
          )}

          {isStakeValid && <>
          {/* Round HUD — 4 metric tiles + countdown ring */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#E2E8F0" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="28" fill="none" stroke="#2563EB" strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(1, countdown / 40))}`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="text-center">
                  <FiClock className="mx-auto text-[#2563EB]" size={12} />
                  <p className="font-mono text-sm font-black text-[#0F172A]">{countdown}s</p>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                {[
                  { icon: FiUsers, label: "Cards", value: String(confirmedCardsCount) },
                  { icon: FiZap, label: "Stake", value: `${stake}` },
                  { icon: FiAward, label: "Pot", value: String(stat?.winner_price ?? 0) },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-2 text-center">
                    <m.icon className="mx-auto mb-0.5 text-[#2563EB]" size={12} />
                    <p className="text-[8px] font-bold uppercase text-[#94A3B8]">{m.label}</p>
                    <p className="text-xs font-black tabular-nums text-[#0F172A]">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Card pool + sticky slip */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-[#0F172A]">Card Pool</h2>
                <p className="text-[10px] font-bold text-[#94A3B8]">Tap to lock in — no confirm button</p>
              </div>
              <span className="rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-black text-[#2563EB]">
                {selectedIds.length} locked
              </span>
            </div>

            {!jackpotLoading && jackpotStats && jackpotStats.jackpot_limit > 0 && (
              <div className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[#2563EB]">Jackpot</p>
                  <p className="font-mono text-xs font-black text-[#0F172A]">
                    {jackpotStats.amount.toFixed(0)} / {jackpotStats.jackpot_limit.toFixed(0)} ETB
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[#2563EB] transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, (jackpotStats.amount / jackpotStats.jackpot_limit) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {Array.from({ length: TOTAL_CARDS / 50 }, (_, index) => index).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setCardRange(range)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black ${
                    cardRange === range ? "bg-[#2563EB] text-white" : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  {range * 50 + 1}–{range * 50 + 50}
                </button>
              ))}
            </div>

            <div className="flex gap-1 rounded-xl bg-[#F1F5F9] p-1">
              {(["open", "yours", "taken"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setCardFilter(filter)}
                  className={`flex-1 rounded-lg py-1.5 text-[10px] font-black capitalize ${
                    cardFilter === filter ? "bg-white text-[#2563EB] shadow-sm" : "text-[#64748B]"
                  }`}
                >
                  {filter === "yours" ? `You (${selectedIds.length})` : filter === "taken" ? `Taken` : "Open"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
              {visibleCardNumbers.map((num) => {
                const isConfirmed = selectedIds.includes(num);
                const isUnavailable =
                  (takenCardIds.includes(num) || pendingCardIds.includes(num)) && !isConfirmed;
                const isTimeUp = isSelectionClosed;
                const isInteractionDisabled = isUnavailable || isTimeUp;

                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      if (!isUnavailable && !isTimeUp) toggleCard(num);
                    }}
                    disabled={isInteractionDisabled}
                    className={`h-10 rounded-xl text-xs font-black transition-all border ${
                      isConfirmed
                        ? "border-[#2563EB] bg-[#2563EB] text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)]"
                        : isUnavailable
                          ? "border-[#FECACA] bg-[#FEE2E2] text-[#B91C1C] opacity-80"
                          : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] hover:border-[#93C5FD] hover:bg-[#EFF6FF]"
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Sticky-style bet slip */}
          <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">Bet Slip</p>
                <p className="text-xs font-bold text-[#0F172A]">
                  {selectedIds.length} {selectedIds.length === 1 ? "card" : "cards"} · auto-locked
                </p>
              </div>
              <button
                type="button"
                onClick={clearCardSelection}
                disabled={selectedIds.length === 0 || isSelectionClosed || isStartingGame}
                className="rounded-lg bg-[#F1F5F9] px-2.5 py-1 text-[10px] font-black text-[#64748B] disabled:opacity-40"
              >
                Clear
              </button>
            </div>

            <div className="mb-2 flex min-h-8 gap-1.5 overflow-x-auto no-scrollbar">
              {selectedIds.length > 0 ? (
                selectedIds.map((cardId) => (
                  <button
                    key={cardId}
                    type="button"
                    onClick={() => toggleCard(cardId)}
                    className="shrink-0 rounded-full bg-[#EFF6FF] px-2.5 py-1 text-[10px] font-black text-[#2563EB]"
                  >
                    #{cardId} ×
                  </button>
                ))
              ) : (
                <span className="text-[11px] font-bold text-[#94A3B8]">Tap open cards above to join</span>
              )}
            </div>

            <div className="mb-2 flex justify-between text-[11px] font-bold">
              <span className="text-[#94A3B8]">Total ({selectedIds.length} × {stake.toFixed(2)})</span>
              <span className="font-mono text-[#0F172A]">{(selectedIds.length * stake).toFixed(2)} ETB</span>
            </div>

            <div
              className={`flex h-11 w-full items-center justify-center rounded-2xl text-xs font-black ${
                selectedIds.length === 0
                  ? "border border-dashed border-[#CBD5E1] text-[#94A3B8]"
                  : isStartingGame
                    ? "bg-[#DBEAFE] text-[#2563EB]"
                    : "bg-[#2563EB] text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
              }`}
            >
              {selectedIds.length === 0
                ? "Select cards to join"
                : isStartingGame
                  ? "Starting game…"
                  : `Locked · ${(selectedIds.length * stake).toFixed(2)} ETB · waiting`}
            </div>
          </section>

          {stat?.running && selectedIds.length === 0 && (
            <button
              type="button"
              onClick={() => router.push(`/play/${stake}`)}
              className="w-full rounded-2xl bg-gradient-to-r from-[#38BDF8] to-[#2563EB] py-3.5 text-sm font-black text-white shadow-[0_8px_28px_rgba(37,99,235,0.4)]"
            >
              Enter Live Game
            </button>
          )}

          {previewCard && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
            >
              <p className="mb-2 text-center text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">
                Preview · Card #{previewCard.id}
              </p>
              <div className="mx-auto w-[200px]">
                <div className="mb-1.5 grid grid-cols-5 gap-1">
                  {["B", "I", "N", "G", "O"].map((letter, i) => (
                    <div
                      key={letter}
                      className={`flex h-6 items-center justify-center rounded-md text-[11px] font-black text-white ${
                        ["bg-[#3B82F6]", "bg-[#087F73]", "bg-[#D64C3D]", "bg-[#E39B29]", "bg-[#2874A6]"][i]
                      }`}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {previewCard.numbers.flat().map((n, i) => (
                    <div
                      key={i}
                      className={`flex h-8 items-center justify-center rounded-md text-sm font-bold border ${
                        n === 0
                          ? "border-[#2563EB] bg-[#2563EB] text-white"
                          : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]"
                      }`}
                    >
                      {n === 0 ? "★" : n}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          </>}
        </motion.main>
      </div>
    </Suspense>
  );
}
