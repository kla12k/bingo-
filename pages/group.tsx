import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FiAward, FiClock, FiStar, FiUsers, FiZap } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { getSocket } from "@/lib/socket";
import type { WeeklyStat } from "@/lib/weekly-bingo-types";
import { KineticLoader } from "@/components/KineticLoader";
import { pageTitle } from "@/lib/brand";
import WeeklyMiniCard from "@/components/WeeklyMiniCard";

function formatCountdown(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) {
    return `${d}d ${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type WinnerDisplay = NonNullable<WeeklyStat["todays_winner"]> | NonNullable<WeeklyStat["last_week_winner"]>;

type LobbyMeta = {
  todays_winner?: WeeklyStat["todays_winner"];
  last_week_winner?: WeeklyStat["last_week_winner"];
  recent_history?: WeeklyStat["recent_history"];
};

export default function WeeklyBingoPage() {
  const router = useRouter();
  const [stat, setStat] = useState<WeeklyStat | null>(null);
  const [lobbyMeta, setLobbyMeta] = useState<LobbyMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [startSeconds, setStartSeconds] = useState(0);
  const [regSeconds, setRegSeconds] = useState(0);
  const editionIdRef = useRef<string | null>(null);
  const cardGridRef = useRef<HTMLDivElement>(null);
  const prevEditionIdRef = useRef<string | null>(null);
  const localMyEntryRef = useRef<{
    editionId: string;
    entry: NonNullable<WeeklyStat["my_entry"]>;
  } | null>(null);
  const pendingPickRef = useRef<number[]>([]);

  function resetPickerForNewEdition() {
    localMyEntryRef.current = null;
    pendingPickRef.current = [];
    setSelectedIds([]);
    setConfirming(false);
    setError("");
    prevEditionIdRef.current = null;
  }

  function refreshLobbyFromServer(editionId?: string) {
    resetPickerForNewEdition();
    setStat(null);
    setLoading(true);
    getSocket().emit(
      "join_weekly_lobby",
      editionId ? { edition_id: editionId } : {}
    );
  }

  useEffect(() => {
    const editionId = stat?.edition_id ?? null;
    if (!editionId || !stat) return;
    const editionChanged =
      prevEditionIdRef.current !== null && prevEditionIdRef.current !== editionId;
    if (editionChanged) {
      resetPickerForNewEdition();
      if (stat.my_entry?.card_ids?.length) {
        localMyEntryRef.current = { editionId, entry: stat.my_entry };
        setSelectedIds(stat.my_entry.card_ids);
      }
      getSocket().emit("join_weekly_lobby", { edition_id: editionId });
    } else if (stat.my_entry?.card_ids?.length) {
      pendingPickRef.current = [];
      setSelectedIds(stat.my_entry.card_ids);
    }
    // Keep local pick while user is browsing — do not clear on lobby stat refresh
    prevEditionIdRef.current = editionId;
  }, [stat, stat?.edition_id, stat?.my_entry?.card_ids?.join(",")]);

  const startsAtMs = stat?.starts_at ? new Date(stat.starts_at).getTime() : 0;
  const regOpensMs = stat?.registration_opens_at
    ? new Date(stat.registration_opens_at).getTime()
    : 0;

  useEffect(() => {
    if (!startsAtMs) return;
    const tick = () => setStartSeconds(Math.max(0, Math.ceil((startsAtMs - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startsAtMs]);

  useEffect(() => {
    if (!regOpensMs) return;
    const tick = () => setRegSeconds(Math.max(0, Math.ceil((regOpensMs - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [regOpensMs]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    refreshLobbyFromServer();

    const onStat = (s: WeeklyStat) => {
      if (s.my_entry) {
        localMyEntryRef.current = { editionId: s.edition_id, entry: s.my_entry };
      } else if (localMyEntryRef.current?.editionId !== s.edition_id) {
        localMyEntryRef.current = null;
      }

      const myEntry =
        s.my_entry ??
        (localMyEntryRef.current?.editionId === s.edition_id
          ? localMyEntryRef.current.entry
          : null);

      setStat((prev) => {
        if (prev?.edition_id !== s.edition_id) {
          setSelectedIds(myEntry?.card_ids ?? []);
          return { ...s, my_entry: myEntry };
        }
        return { ...s, my_entry: myEntry };
      });
      setLoading(false);
      editionIdRef.current = s.edition_id;
      if (s.status === "running") router.push(`/weekly/${s.edition_id}/play`);
    };
    const onLobbyMeta = (payload: LobbyMeta) => setLobbyMeta(payload);
    const onNoEdition = (payload: LobbyMeta) => {
      setStat(null);
      setLobbyMeta(payload);
      setLoading(false);
    };
    const onConfirmed = (p: { edition_id: string; card_ids: number[]; entry_fee_paid?: number }) => {
      if (p.edition_id === editionIdRef.current) {
        setConfirming(false);
        setError("");
        if (p.card_ids?.length) {
          pendingPickRef.current = [];
          setSelectedIds(p.card_ids);
          localMyEntryRef.current = {
            editionId: p.edition_id,
            entry: {
              user_id: "",
              card_ids: p.card_ids,
              entry_fee_paid: p.entry_fee_paid ?? 0,
              display_name: "",
            },
          };
        }
      }
    };
    const onStarted = (p: { edition_id: string }) => router.push(`/weekly/${p.edition_id}/play`);
    const onEditionFinished = (p: { edition_id: string; next_edition_id?: string | null }) => {
      refreshLobbyFromServer(p.next_edition_id ?? undefined);
    };
    const onErr = (p: { message?: string }) => {
      setConfirming(false);
      if (p?.message) setError(p.message);
    };

    socket.on("weekly_stat", onStat);
    socket.on("weekly_lobby_meta", onLobbyMeta);
    socket.on("weekly_no_edition", onNoEdition);
    socket.on("weekly_entry_confirmed", onConfirmed);
    socket.on("weekly_game_started", onStarted);
    socket.on("weekly_edition_finished", onEditionFinished);
    socket.on("error", onErr);

    return () => {
      socket.off("weekly_stat", onStat);
      socket.off("weekly_lobby_meta", onLobbyMeta);
      socket.off("weekly_no_edition", onNoEdition);
      socket.off("weekly_entry_confirmed", onConfirmed);
      socket.off("weekly_game_started", onStarted);
      socket.off("weekly_edition_finished", onEditionFinished);
      socket.off("error", onErr);
    };
  }, [router]);

  useEffect(() => {
    const onRoute = (url: string) => {
      if (url === "/group" || url.startsWith("/group?")) {
        refreshLobbyFromServer();
      }
    };
    router.events.on("routeChangeComplete", onRoute);
    return () => router.events.off("routeChangeComplete", onRoute);
  }, [router]);

  const activeMyEntry =
    stat?.my_entry ??
    (localMyEntryRef.current?.editionId === stat?.edition_id
      ? localMyEntryRef.current?.entry
      : null);

  const maxCards = Math.max(1, stat?.max_cards_per_user ?? 1);

  useEffect(() => {
    if (!stat?.edition_id || activeMyEntry) return;
    pendingPickRef.current = selectedIds;
    const t = setTimeout(() => {
      getSocket().emit("weekly_pending_selection", {
        edition_id: stat.edition_id,
        card_ids: selectedIds,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [selectedIds, stat?.edition_id, activeMyEntry]);

  useEffect(() => {
    if (startSeconds === 0 && stat?.status === "running" && stat.edition_id) {
      router.push(`/weekly/${stat.edition_id}/play`);
    }
  }, [startSeconds, stat?.status, stat?.edition_id, router]);

  function toggleCard(num: number) {
    setSelectedIds((prev) => {
      if (prev.includes(num)) {
        const next = prev.filter((id) => id !== num);
        pendingPickRef.current = next;
        return next;
      }
      if (prev.length >= maxCards) {
        setError(maxCards === 1 ? "Pick only 1 card" : `Max ${maxCards} cards`);
        return prev;
      }
      setError("");
      const next = [...prev, num];
      pendingPickRef.current = next;
      return next;
    });
  }

  function handleConfirm() {
    if (!stat?.edition_id || selectedIds.length === 0) {
      setError(maxCards > 1 ? "Pick at least one card" : "Pick a card number first");
      return;
    }
    if (selectedIds.length > maxCards) {
      setError(`Max ${maxCards} card(s) allowed`);
      return;
    }
    setConfirming(true);
    setError("");
    getSocket().emit("weekly_confirm_entry", {
      edition_id: stat.edition_id,
      card_ids: selectedIds,
    });
  }

  const taken = new Set(stat?.taken_card_ids ?? []);
  const myCardIds = activeMyEntry?.card_ids ?? [];
  const joined = myCardIds.length > 0;
  const pickerLocked = joined || confirming;
  const registrationOpen = stat?.registration_open === true;
  const displayIds = useMemo(() => Array.from({ length: 500 }, (_, i) => i + 1), []);
  const showCardPicker = joined || (stat?.status === "open" && registrationOpen);
  const payAmount = (stat?.stake ?? 0) * Math.max(1, selectedIds.length || 1);

  const featuredWinner: WinnerDisplay | null =
    lobbyMeta?.todays_winner ?? lobbyMeta?.last_week_winner ?? null;
  const featuredLabel = lobbyMeta?.todays_winner ? "This week winner" : "Last week";
  const featuredId =
    lobbyMeta?.todays_winner?.edition_id ?? lobbyMeta?.last_week_winner?.id ?? null;
  const pastGames = (lobbyMeta?.recent_history ?? []).filter((g) => g.id !== featuredId);
  const showFeaturedWinner =
    featuredWinner &&
    (!stat ||
      (!registrationOpen && stat.status !== "running" && startSeconds > 0));

  return (
    <>
      <Head>
        <title>{pageTitle("Weekly Bingo")}</title>
      </Head>

      <main className="fixed inset-x-0 top-0 bottom-0 overflow-hidden flex flex-col px-3 py-2 max-w-2xl mx-auto bg-background text-foreground">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary-muted border border-primary-border">
              <FiAward className="text-lg text-primary" />
            </div>
            <div>
              <h1 className="text-base font-black text-foreground tracking-tight leading-tight">Weekly Bingo</h1>
              <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Pick card • Auto play</p>
            </div>
          </div>
          <Link
            href="/weekly/history"
            className="text-[10px] font-bold text-primary uppercase px-2 py-1 rounded-md border border-primary-border bg-primary-muted hover:bg-primary/15 transition-colors"
          >
            History
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <KineticLoader variant="ring" size="lg" className="text-primary" />
            <p className="text-sm text-muted-foreground">Connecting…</p>
          </div>
        ) : !stat ? (
          <div className="flex-1 flex flex-col min-h-0 gap-2 overflow-hidden">
            <div className="rounded-2xl border border-border bg-surface p-6 text-center shrink-0 shadow-[0_4px_14px_rgba(30,36,51,0.06)]">
              <h2 className="text-lg font-black text-foreground">Next game coming soon</h2>
              <p className="text-muted text-sm mt-2">Check back when registration opens.</p>
            </div>
            {showFeaturedWinner && <WinnerShowcase winner={featuredWinner} label={featuredLabel} />}
            {pastGames.length > 0 && (
              <PastGamesList rows={pastGames} className="flex-1 min-h-0" />
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-1">
            <div className="shrink-0 rounded-xl border border-border bg-surface px-2.5 py-2 shadow-[0_2px_8px_rgba(30,36,51,0.06)]">
              <h2 className="text-sm font-bold text-foreground leading-tight truncate">{stat.title}</h2>
              <p className="text-[11px] text-muted mt-0.5">
                Stake{" "}
                <span className="font-bold" style={{ color: "var(--stake-green)" }}>
                  {stat.stake} BIRR
                </span>
                {" • "}
                {stat.pattern} pattern{stat.pattern === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-4 gap-1 mt-1.5">
                <StatBox icon={<FiClock className="mx-auto text-primary w-3 h-3" />} label="Starts" value={formatCountdown(startSeconds)} valueClass="text-primary" compact />
                <StatBox icon={<FiUsers className="mx-auto text-primary w-3 h-3" />} label="Players" value={registrationOpen ? String(stat.participant_count) : "—"} compact />
                <StatBox label="Cards" value={registrationOpen ? String(stat.total_cards) : "—"} compact />
                <StatBox label="Win" value={registrationOpen ? `${stat.winner_price_estimate}` : "—"} valueClass="text-primary" compact />
              </div>
            </div>

            {!registrationOpen && stat.status === "open" && !joined && (
              <div className="shrink-0 rounded-lg border border-primary-border bg-primary-muted px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Registration opens in</p>
                <p className="font-mono font-bold text-base text-foreground mt-0.5 tabular-nums leading-none">{formatCountdown(regSeconds)}</p>
              </div>
            )}

            {showFeaturedWinner && (
              <div className="shrink-0">
                <WinnerShowcase winner={featuredWinner} label={featuredLabel} compact />
              </div>
            )}

            {showCardPicker ? (
              <div className="flex-1 min-h-[280px] flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_2px_8px_rgba(30,36,51,0.06)]">
                {joined && (
                  <div className="shrink-0 border-b border-success/30 bg-success/10 px-4 py-2.5 text-center">
                    <p className="font-black text-success text-sm">
                      You&apos;re in — Card{myCardIds.length > 1 ? "s" : ""} #{myCardIds.join(", #")}
                    </p>
                  </div>
                )}
                <p className="shrink-0 text-[10px] font-bold uppercase text-muted px-3 pt-2 tracking-wider">
                  {maxCards > 1
                    ? `Select up to ${maxCards} cards (${selectedIds.length}/${maxCards})`
                    : "Select card number"}
                </p>
                <div
                  ref={cardGridRef}
                  className="flex-1 min-h-[200px] overflow-y-auto overscroll-contain custom-scrollbar px-2 pb-2 touch-pan-y"
                >
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                    {displayIds.map((num) => {
                      const isMine = myCardIds.includes(num);
                      const isSelected = isMine || selectedIds.includes(num);
                      const isTaken = taken.has(num) && !isMine;
                      const cellClass = `py-1.5 rounded-lg text-xs font-bold text-center transition-colors duration-150
                        ${isTaken ? "line-through decoration-primary/40 decoration-4 opacity-50 bg-surface-elevated text-muted" : ""}
                        ${isSelected ? "bg-gradient-to-br from-primary to-primary-hover text-white shadow-[0_0_12px_rgba(var(--primary-rgb),0.25)] ring-2 ring-primary/50" : "bg-surface-elevated border border-border text-foreground"}
                        ${!pickerLocked && !isTaken ? "hover:bg-primary-muted hover:border-primary-border active:scale-[0.97]" : ""}`;

                      if (pickerLocked) {
                        return (
                          <div key={num} data-card-id={num} className={cellClass}>
                            {num}
                          </div>
                        );
                      }
                      return (
                        <button
                          key={num}
                          type="button"
                          data-card-id={num}
                          disabled={isTaken}
                          onClick={() => toggleCard(num)}
                          className={cellClass}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="shrink-0 p-1 border-t border-border">
                  {joined ? (
                    <p className="text-sm text-center text-muted-foreground font-medium">Locked until game starts</p>
                  ) : (
                    <>
                      {error && <p className="text-error text-sm mb-2 font-bold text-center">{error}</p>}
                      <Button
                        className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-bold uppercase text-sm shadow-[0_2px_10px_rgba(var(--primary-rgb),0.2)]"
                        disabled={confirming || selectedIds.length === 0}
                        onClick={handleConfirm}
                      >
                        <FiZap className="mr-2 w-5 h-5" />
                        {confirming
                          ? "Confirming…"
                          : `Pay ${payAmount} BIRR & join${selectedIds.length > 1 ? ` (${selectedIds.length})` : ""}`}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="shrink-0 text-center text-sm text-muted-foreground  font-medium">
                {/* {stat.status === "open" && !registrationOpen
                  ? "Waiting for registration to open…"
                  : `Game starts ${formatCountdown(startSeconds)}`} */}
              </p>
            )}

            {showFeaturedWinner && pastGames.length > 0 && (
              <div className="shrink-0 max-h-52 overflow-hidden flex flex-col rounded-xl border border-border bg-surface">
                <PastGamesList rows={pastGames} compact />
              </div>
            )}

            <Link href="/stake" className="shrink-0">
              <Button variant="outline" className="w-full border-border text-xs py-2.5 text-muted hover:border-primary hover:text-primary">
                Play regular stake rooms
              </Button>
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function StatBox({
  icon,
  label,
  value,
  valueClass = "",
  compact,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg bg-surface-elevated border border-border text-center ${compact ? "px-1 py-1" : "p-2.5"}`}>
      {icon}
      <p className={`uppercase text-muted tracking-wide font-semibold ${compact ? "text-[8px] leading-none mt-0.5" : "text-[10px] mt-0.5"}`}>{label}</p>
      <p className={`font-bold tabular-nums leading-none text-foreground ${compact ? "text-[10px] mt-0.5" : "text-sm mt-0.5"} ${valueClass}`}>{value}</p>
    </div>
  );
}

function PastGamesList({
  rows,
  compact,
  className = "",
}: {
  rows: NonNullable<WeeklyStat["recent_history"]>;
  compact?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between px-1 mb-1.5 shrink-0">
        <p className="text-[10px] font-bold uppercase text-muted tracking-wider mt-1">
          Past games
        </p>
        <Link href="/weekly/history" className="text-[10px] font-bold text-primary uppercase mt-1">
          View all
        </Link>
      </div>
      <div
        className={`overflow-y-auto overscroll-contain custom-scrollbar space-y-1.5 ${compact ? "px-1 pb-1" : "px-0.5"}`}
      >
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border border-border bg-surface-elevated flex justify-between items-center gap-2 ${compact ? "px-2 py-1.5" : "px-3 py-2.5"}`}
          >
            <div className="min-w-0 flex-1">
              <p className={`font-bold truncate text-foreground ${compact ? "text-xs" : "text-sm"}`}>{r.winner_name}</p>
              <p className={`text-muted truncate ${compact ? "text-[10px]" : "text-xs"}`}>{r.title}</p>
              {r.finished_at && (
                <p className="text-xs text-muted/80 mt-0.5">
                  {new Date(r.finished_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={`font-bold text-primary ${compact ? "text-xs" : "text-sm"}`}>{r.winner_price} BIRR</p>
              <p className={`text-muted ${compact ? "text-[10px]" : "text-xs"}`}>Card #{r.winner_card_id}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinnerShowcase({
  winner,
  label,
  compact,
}: {
  winner: WinnerDisplay;
  label: string;
  compact?: boolean;
}) {
  const hasCard = winner.winner_card && winner.winner_card.length > 0;
  return (
    <div className={`rounded-xl border border-primary-border bg-gradient-to-br from-primary-muted to-surface overflow-hidden ${compact ? "" : "shadow-[0_4px_14px_rgba(30,36,51,0.08)]"}`}>
      <div className={`flex gap-2 ${compact ? "p-2" : "p-4"}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <FiStar className="text-primary w-3 h-3 shrink-0" />
            <p className="text-[10px] uppercase text-primary tracking-wider font-bold">{label}</p>
          </div>
          <p className="font-bold text-foreground text-sm truncate leading-tight">{winner.winner_name}</p>
          <p className="text-xs text-primary font-bold mt-0.5">{winner.winner_price} BIRR</p>
          <p className="text-[11px] text-muted font-medium mt-0.5">Card #{winner.winner_card_id}</p>
        </div>
        {hasCard && (
          <div className="shrink-0 rounded-lg bg-surface p-1 border border-border">
            <WeeklyMiniCard
              grid={winner.winner_card!}
              highlightPositions={winner.winning_numbers ?? []}
              calledNumbers={winner.called_numbers ?? []}
              size={compact ? "xs" : "sm"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
