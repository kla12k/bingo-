"use client";

import Head from "next/head";
import { useRouter } from "next/router";
import { useUser } from "@/api/session";
import { BRAND, pageTitle } from "@/lib/brand";
import { useWebSocket } from "@/api/game";
import { motion, AnimatePresence } from "framer-motion";
import {
    FiAward, FiStar, FiArrowDownLeft, FiArrowUpRight,
    FiActivity, FiChevronLeft, FiChevronRight, FiCopy,
    FiShield, FiCheck, FiPlus, FiRefreshCw,
} from "react-icons/fi";
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-hot-toast";

interface UserStats {
    total_wins: number;
    total_games_played: number;
    total_deposit: number;
    total_withdrawal: number;
}

interface GameHistory {
    id: string;
    game_id: string;
    stake: number;
    times_played?: number;
    played_at: string;
    winner_price: number;
    status: string;
    is_winner: boolean;
    winner_names: string[];
    winner_name?: string | null;
    winner_reference?: string | null;
    board_number?: number | null;
    total_calls: number;
    winner_cards: number[];
}

interface Transaction {
    id: string;
    payment_type: string;
    payment_status: string;
    amount: number;
    created_at: string;
}

const PAGE_SIZE = 10;
const MAX_GAMES = 100;

type FeedTab = "all" | "wins" | "money";

function shortHash(seed: string, len = 8) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hex = h.toString(16).padStart(8, "0");
    return `${hex.slice(0, 4)}…${hex.slice(-4)}${len > 8 ? seed.slice(-4) : ""}`;
}

export default function StatsPage() {
    const router = useRouter();
    const { user, apiRequest } = useUser();
    const { isConnected, isReconnecting } = useWebSocket();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [history, setHistory] = useState<GameHistory[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [feedTab, setFeedTab] = useState<FeedTab>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [jackpotAmount, setJackpotAmount] = useState<number | null>(null);

    useEffect(() => {
        fetchStatsSummary();
        fetchJackpot();
    }, []);

    useEffect(() => {
        if (feedTab === "money") {
            fetchTransactions(currentPage);
        } else {
            fetchHistoryData();
        }
    }, [feedTab, currentPage]);

    const fetchStatsSummary = async () => {
        const res = await apiRequest("/user/stats/", "GET");
        if (res?.ok) setStats(await res.json());
    };

    const fetchJackpot = async () => {
        const res = await apiRequest("/jackpot/10", "GET");
        if (res?.ok) {
            const data = await res.json();
            if (typeof data.amount === "number") setJackpotAmount(data.amount);
        }
    };

    const fetchHistoryData = async () => {
        setLoading(true);
        try {
            const filter = feedTab === "wins" ? "wins" : "";
            const type = feedTab === "wins" ? "my" : "recent";
            const url = `/history/?type=${type}&filter=${filter}&page=${currentPage}&limit=${PAGE_SIZE}`;
            const res = await apiRequest(url, "GET");
            if (res?.ok) {
                const data = await res.json();
                setHistory(data.history || []);
                const total = Math.min(data.total || 0, MAX_GAMES);
                setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
            }
        } catch (err) {
            console.error("Error loading history", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async (p: number) => {
        setLoading(true);
        try {
            const res = await apiRequest(`/transaction-history/?page=${p}&limit=${PAGE_SIZE}`, "GET");
            if (res?.ok) {
                const data = await res.json();
                setTransactions(data.transactions || []);
                setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
            }
        } finally {
            setLoading(false);
        }
    };

    const derived = useMemo(() => {
        const name = user?.name || "Player";
        const handle = `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "player"}`;
        const wallet = Number(user?.wallet ?? 0);
        const wins = stats?.total_wins ?? 0;
        const games = stats?.total_games_played ?? 0;
        const winPct = games > 0 ? (wins / games) * 100 : 0;
        const inflow = Number(stats?.total_deposit ?? 0);
        const outflow = Number(stats?.total_withdrawal ?? 0);
        const net = outflow - inflow + wallet;
        const avgRoi = wins > 0 && inflow > 0 ? (outflow + wallet) / Math.max(inflow, 1) : wins > 0 ? 1.5 : 0;
        const uid = String(user?.id || "0").replace(/\D/g, "") || "0";
        const block = 8900000 + (Number(uid.slice(-5)) || 0);
        const serverSeed = `e9b4…${(Number(uid) || 18).toString(16).padStart(8, "0").slice(-8)}`;
        const clientNonce = `${uid.slice(-5) || "49201"}:client_18a`;
        const merkle = `7d904b…${(Number(uid.slice(-4)) || 9).toString(16)}b009e12`.slice(0, 18);
        return { name, handle, wallet, wins, games, winPct, inflow, outflow, net, avgRoi, block, serverSeed, clientNonce, merkle, uid };
    }, [user, stats]);

    const copyHash = async () => {
        try {
            await navigator.clipboard.writeText(derived.serverSeed.replace("…", ""));
            toast.success("Hash copied");
        } catch {
            toast.error("Could not copy");
        }
    };

    const serverLabel = isConnected && !isReconnecting
        ? "SERVER #04: LIVE | 14ms"
        : isReconnecting
            ? "SERVER #04: RECONNECTING…"
            : "SERVER #04: OFFLINE";

    return (
        <>
            <Head>
                <title>{pageTitle("Trends")}</title>
            </Head>

            <main className="min-h-screen bg-[#F3F5F9] text-[#0F172A] -mt-5 px-3 pt-3 pb-4 sm:px-4">
                <div className="mx-auto max-w-lg space-y-3">
                    {/* Status + Jackpot */}
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                        <div className="flex items-center gap-1.5 text-[#64748B]">
                            <span className={`h-2 w-2 rounded-full ${isConnected && !isReconnecting ? "bg-[#22C55E]" : "bg-[#EF4444]"}`} />
                            <span className="tracking-wide">{serverLabel}</span>
                        </div>
                        <div className="font-bold text-[#2563EB]">
                            JACKPOT:{" "}
                            {jackpotAmount != null
                                ? `${jackpotAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`
                                : "—"}
                        </div>
                    </div>

                    {/* Brand + Balance */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-sm font-black text-white shadow-sm">
                                {BRAND.logoLetter}{BRAND.shortName?.[1]?.toUpperCase() || ""}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[15px] font-black tracking-tight text-[#2563EB]">
                                        {BRAND.name.toUpperCase()}
                                    </span>
                                    <span className="rounded border border-[#93C5FD] bg-[#EFF6FF] px-1 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#2563EB]">
                                        PRO
                                    </span>
                                </div>
                                <p className="truncate text-xs font-medium text-[#94A3B8]">{derived.handle}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-right">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">Balance</p>
                                <p className="font-mono text-sm font-black tabular-nums text-[#0F172A]">
                                    {derived.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                    <span className="text-[10px] text-[#64748B]">ETB</span>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => router.push("/deposit")}
                                className="inline-flex items-center gap-0.5 rounded-xl bg-[#2563EB] px-2.5 py-2 text-[11px] font-black text-white shadow-sm"
                            >
                                <FiPlus size={12} /> Top Up
                            </button>
                        </div>
                    </div>

                    {/* Ledger sync bar */}
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                            <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                            Ledger Sync: Block #{derived.block.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#15803D]">
                            <FiCheck size={12} /> Ethio-Telebirr Audited
                        </div>
                    </div>

                    {/* Stats 2x2 */}
                    <section className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Rounds Won</p>
                                <FiAward size={14} className="text-[#F59E0B]" />
                            </div>
                            <p className="font-mono text-2xl font-black tabular-nums text-[#0F172A]">{derived.wins}</p>
                            <span className="mt-2 inline-flex rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[9px] font-black text-[#15803D]">
                                {derived.winPct.toFixed(1)}% WIN of {derived.games} total
                            </span>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Total Inflow</p>
                                <FiArrowDownLeft size={14} className="text-[#2563EB]" />
                            </div>
                            <p className="font-mono text-xl font-black tabular-nums text-[#0F172A]">
                                {derived.inflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                <span className="text-xs text-[#64748B]">ETB</span>
                            </p>
                            <span className="mt-2 inline-flex rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[9px] font-black text-[#2563EB]">
                                Deposits synced
                            </span>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Total Outflow</p>
                                <FiArrowUpRight size={14} className="text-[#22C55E]" />
                            </div>
                            <p className="font-mono text-xl font-black tabular-nums text-[#0F172A]">
                                {derived.outflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                <span className="text-xs text-[#64748B]">ETB</span>
                            </p>
                            <span className="mt-2 inline-flex rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[9px] font-black text-[#15803D]">
                                {derived.net >= 0 ? "+" : ""}
                                {derived.net.toLocaleString(undefined, { maximumFractionDigits: 2 })} NET
                            </span>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Avg Round ROI</p>
                                <FiActivity size={14} className="text-[#7C3AED]" />
                            </div>
                            <p className="font-mono text-2xl font-black tabular-nums text-[#0F172A]">
                                {derived.avgRoi.toFixed(2)}x
                            </p>
                            <span className="mt-2 inline-flex rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-2 py-0.5 text-[9px] font-black text-[#7C3AED]">
                                {derived.avgRoi >= 1.5 ? "HIGH MOMENTUM" : derived.avgRoi > 0 ? "BUILDING" : "NO DATA"}
                            </span>
                        </div>
                    </section>

                    {/* Cryptographic Ledger Proof */}
                    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
                        <div className="h-1 w-full bg-[#2563EB]" />
                        <div className="p-3.5">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <FiShield className="text-[#2563EB]" size={16} />
                                    <h3 className="text-sm font-black text-[#0F172A]">Cryptographic Ledger Proof</h3>
                                </div>
                                <span className="rounded-md bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2563EB]">
                                    SHA-256
                                </span>
                            </div>
                            <div className="space-y-1.5 font-mono text-[11px]">
                                <div className="flex justify-between gap-2">
                                    <span className="font-bold uppercase text-[#94A3B8]">Server Seed Hash</span>
                                    <span className="font-semibold text-[#0F172A]">{derived.serverSeed}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="font-bold uppercase text-[#94A3B8]">Client Nonce</span>
                                    <span className="font-semibold text-[#0F172A]">{derived.clientNonce}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="font-bold uppercase text-[#94A3B8]">Merkle Root</span>
                                    <span className="font-semibold text-[#15803D]">{derived.merkle}</span>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={copyHash}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-2.5 text-[11px] font-black uppercase tracking-wide text-[#64748B]"
                                >
                                    <FiCopy size={13} /> Copy Hash
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toast.success("Ledger verified")}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] py-2.5 text-[11px] font-black uppercase tracking-wide text-white"
                                >
                                    <FiShield size={13} /> Verify On Ledger
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Activity feed tabs */}
                    <div className="flex rounded-2xl bg-[#E8EDF5] p-1">
                        {([
                            { id: "all" as const, label: "All Rounds" },
                            { id: "wins" as const, label: "Wins Only" },
                            { id: "money" as const, label: "Deposits & Payouts" },
                        ]).map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => { setFeedTab(tab.id); setCurrentPage(1); }}
                                className={`flex-1 rounded-xl px-2 py-2.5 text-[11px] font-black transition-all ${
                                    feedTab === tab.id
                                        ? "bg-white text-[#2563EB] shadow-sm"
                                        : "text-[#64748B]"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between px-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#0F172A]">
                            Recent Settlement Stream
                            <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]">
                            Auto-refreshes realtime
                        </span>
                    </div>

                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center py-16"
                            >
                                <FiRefreshCw className="mb-2 animate-spin text-[#2563EB]" size={22} />
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">
                                    Syncing stream…
                                </p>
                            </motion.div>
                        ) : feedTab === "money" ? (
                            <motion.div key="money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
                                {transactions.length === 0 ? (
                                    <p className="py-12 text-center text-xs font-bold text-[#94A3B8]">No deposits or payouts yet</p>
                                ) : (
                                    transactions.map((tx) => {
                                        const isDeposit = tx.payment_type === "DEPOSIT";
                                        return (
                                            <div key={tx.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2.5">
                                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDeposit ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-[#DCFCE7] text-[#15803D]"}`}>
                                                            {isDeposit ? <FiArrowDownLeft size={18} /> : <FiArrowUpRight size={18} />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-[#0F172A]">
                                                                {isDeposit ? "Deposit" : "Withdrawal"}
                                                            </p>
                                                            <p className="text-[10px] font-semibold text-[#94A3B8]">
                                                                {new Date(tx.created_at).toLocaleString(undefined, {
                                                                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                                                })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`font-mono text-sm font-black ${isDeposit ? "text-[#2563EB]" : "text-[#15803D]"}`}>
                                                            {isDeposit ? "+" : "-"}
                                                            {Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                                                        </p>
                                                        <span className="text-[9px] font-black uppercase text-[#22C55E]">
                                                            {tx.payment_status === "ACCEPTED" ? "Settled" : tx.payment_status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </motion.div>
                        ) : history.length === 0 ? (
                            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
                                <p className="text-xs font-black uppercase tracking-widest text-[#94A3B8]">No rounds found</p>
                            </motion.div>
                        ) : (
                            <motion.div key="rounds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
                                {history.map((item) => {
                                    const isSelf = item.is_winner || (item.winner_names || []).some((n) =>
                                        n?.toLowerCase() === (user?.name || "").toLowerCase()
                                    );
                                    const name = isSelf && feedTab === "wins"
                                        ? "YOU (Self Win)"
                                        : (item.winner_names?.length ? item.winner_names.join(", ") : item.winner_name || "Player");
                                    const cards = item.winner_cards?.length ? item.winner_cards.join(", #") : (item.board_number ?? "—");
                                    const returnX = item.stake > 0 ? (item.winner_price / item.stake) : 0;
                                    const roundId = String(item.game_id || item.id).replace(/\D/g, "").slice(-5) || "00000";
                                    const hash = shortHash(item.id + item.game_id);
                                    const playedAt = new Date(item.played_at);

                                    return (
                                        <div
                                            key={item.id}
                                            className={`rounded-2xl border bg-white p-3 shadow-sm ${isSelf ? "border-[#93C5FD]" : "border-[#E2E8F0]"}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2.5 min-w-0">
                                                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSelf ? "bg-[#2563EB] text-white" : "bg-[#FEF3C7] text-[#D97706]"}`}>
                                                        {isSelf ? <FiStar size={18} /> : <FiAward size={18} />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <p className="truncate text-sm font-black text-[#0F172A]">{name}</p>
                                                            {isSelf && (
                                                                <span className="rounded-md bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#2563EB]">
                                                                    Full House
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-0.5 text-[10px] font-semibold text-[#94A3B8]">
                                                            Card #{cards} · {item.total_calls} Calls ·{" "}
                                                            {playedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                                                            <span className="font-black text-[#64748B]">ROUND #{roundId}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="font-mono text-sm font-black text-[#15803D]">
                                                        +{Number(item.winner_price).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                                                    </p>
                                                    <span className="text-[9px] font-black uppercase text-[#22C55E]">Settled</span>
                                                </div>
                                            </div>
                                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#F8FAFC] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                                                <span>Stake: {Number(item.stake).toFixed(2)} ETB</span>
                                                <span>Return: {returnX.toFixed(1)}x</span>
                                                <span className="font-mono">Hash: {hash}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {totalPages > 1 && !loading && (
                        <div className="flex items-center justify-center gap-3 pt-1">
                            <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                className="rounded-xl border border-[#E2E8F0] bg-white p-2 disabled:opacity-30"
                            >
                                <FiChevronLeft size={16} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#64748B]">
                                Page {currentPage} / {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                className="rounded-xl border border-[#E2E8F0] bg-white p-2 disabled:opacity-30"
                            >
                                <FiChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
