"use client";

import Head from "next/head";
import { useUser } from "@/api/session";
import { pageTitle } from "@/lib/brand";
import { motion, AnimatePresence } from "framer-motion";
import { FiGlobe, FiStar } from "react-icons/fi";
import { useState, useEffect } from "react";

interface LeaderboardPlayer {
    rank: number;
    user_id: string;
    name: string;
    phone_number: string;
    total_games_played: number;
}

interface LeaderboardData {
    label: string;
    leaderboard: LeaderboardPlayer[];
    your_rank: LeaderboardPlayer & { rank: number | null };
    total_users_ranked: number;
    from_date: string;
    to_date: string;
}

export default function LeaderboardPage() {
    const { apiRequest } = useUser();
    const [dailyData, setDailyData] = useState<LeaderboardData | null>(null);
    const [weeklyData, setWeeklyData] = useState<LeaderboardData | null>(null);
    const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
    }, []);

    const fetchLeaderboard = async () => {
        setLoading(true);
        const res = await apiRequest("/leaderboard/", "GET");
        if (res?.ok) {
            const data = await res.json();
            setDailyData(data.daily_leaderboard);
            setWeeklyData(data.weekly_leaderboard);
        }
        setLoading(false);
    };

    const currentData = timeframe === "daily" ? dailyData : weeklyData;
    const topThree = currentData?.leaderboard.slice(0, 3) || [];
    const others = currentData?.leaderboard.slice(3) || [];

    const PodiumItem = ({ player, delay }: { player: LeaderboardPlayer, delay: number }) => {
        const isFirst = player.rank === 1;
        const sizeClasses = isFirst ? "h-64 md:h-72" : "h-48 md:h-56";
        const orderClasses = player.rank === 1 ? "order-2" : player.rank === 2 ? "order-1" : "order-3";
        const colorClasses = player.rank === 1 ? "from-primary to-primary-hover" : player.rank === 2 ? "from-info to-info" : "from-primary to-primary-hover";

        return (
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay }}
                className={`flex flex-col items-center flex-1 min-w-[100px] ${orderClasses}`}
            >
                <div className="relative mb-4 z-10">
                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr from-primary to-primary-hover flex items-center justify-center text-2xl font-black text-white shadow-2xl shadow-black/20 ring-4 ring-white/10`}>
                        {player.name?.[0]?.toUpperCase()}
                    </div>
                    {isFirst && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-primary drop-shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)] animate-bounce">
                            <FiStar size={36} fill="currentColor" />
                        </div>
                    )}
                    <div className={`absolute -bottom-3 -left-2 w-8 h-8 rounded-full bg-surface border border-[var(--overlay-border)] shadow-lg flex items-center justify-center text-xs font-black text-foreground`}>
                        {player.rank}
                    </div>
                </div>

                <div className={`w-full rounded-t-[2rem] flex flex-col items-center justify-start p-4 md:p-6 transition-all relative overflow-hidden backdrop-blur-xl ${sizeClasses}
                    ${isFirst
                        ? "bg-gradient-to-b from-primary/50 via-primary/50 to-transparent shadow-[0_-10px_40px_-10px_rgba(7,87,91,0.3)]"
                        : "bg-gradient-to-b from-white/10 via-white/5 to-transparent shadow-[0_-10px_40px_-10px_rgba(7,87,91,0.3)]"
                    }`}
                >
                    {/* Glass Shine Effect */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-50" />

                    <p className={`font-black text-[14px] md:text-xs text-center truncate w-full mb-1 text-foreground`}>
                        {player.name}
                    </p>
                    <p className={`text-[14px] font-black uppercase tracking-widest text-foreground`}>
                        {player.total_games_played} <span className="text-[8px] opacity-60">GAMES</span>
                    </p>
                    <div className="mt-auto mb-2 text-[8px] font-black py-1 px-3 rounded-full bg-[var(--overlay-bg)] text-foreground uppercase tracking-widest border border-[var(--overlay-border)]">
                        PLAYER #{player.user_id}
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <>
            <Head>
                <title>{pageTitle("Leaderboard")}</title>
            </Head>

            <main className="min-h-screen pt-4 pb-24 px-4 bg-background text-foreground overflow-hidden selection:bg-primary/30">
                {/* Ambient Background */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
                    <div className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
                    <div className="absolute top-[40%] -right-[10%] w-[500px] h-[500px] rounded-full bg-info/5 blur-[120px]" />
                </div>

                <div className="max-w-3xl mx-auto space-y-4">

                    {/* Header Section */}
                    <header className="text-center pt-8">
                        <motion.h1
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl md:text-6xl font-black tracking-tighter text-foreground"
                        >
                            Leaderboard
                        </motion.h1>
                    </header>

                    {/* Timeframe Switcher */}
                    <div className="p-[1px] rounded-[1.25rem] bg-gradient-to-b from-white/20 to-transparent shadow-lg shadow-black/5">
                        <div className="p-1 bg-surface/80 backdrop-blur-xl rounded-[1.2rem] flex relative isolate overflow-hidden">
                            <motion.div
                                className="absolute inset-y-1 rounded-[1rem] bg-gradient-to-br from-primary to-primary-hover shadow-lg z-[-1]"
                                animate={{
                                    left: timeframe === "daily" ? "4px" : "calc(50% + 2px)",
                                    width: "calc(50% - 6px)",
                                }}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                            {["daily", "weekly"].map((tf) => (
                                <button
                                    key={tf}
                                    onClick={() => setTimeframe(tf as "daily" | "weekly")}
                                    className={`flex-1 py-3 text-[12px] font-black  tracking-widest transition-colors z-10
                                        ${timeframe === tf ? "text-white" : "text-foreground hover:text-foreground"}`}
                                >
                                    {tf == "daily" ? "Today's" : "This Week's"} Ranking
                                </button>
                            ))}
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-96 flex flex-col items-center justify-center gap-4"
                            >
                                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground animate-pulse">Calculating Ranks...</p>
                            </motion.div>
                        ) : topThree.length > 0 ? (
                            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">

                                {/* 🏆 Podium */}
                                <div className="flex items-end justify-center py-8">
                                    {topThree[1] && <PodiumItem player={topThree[1]} delay={0.1} />}
                                    {topThree[0] && <PodiumItem player={topThree[0]} delay={0} />}
                                    {topThree[2] && <PodiumItem player={topThree[2]} delay={0.2} />}
                                </div>

                                {/* 📜 List View - Fancy Gradient Border */}
                                <div className="p-[1px] rounded-[2.5rem] bg-gradient-to-b from-white/20 via-white/5 to-transparent shadow-2xl shadow-black/5">
                                    <div className="bg-surface/60 backdrop-blur-xl rounded-[2.45rem] p-2 sm:p-4 overflow-hidden relative">
                                        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent opacity-50" />

                                        <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-6 py-3 text-[9px] font-black uppercase tracking-widest text-foreground/50 mb-2">
                                            <span>Rank</span>
                                            <span>Player</span>
                                            <span className="text-right">Games</span>
                                        </div>

                                        <div className="space-y-1">
                                            {others.length > 0 ? others.map((player) => (
                                                <motion.div
                                                    key={player.user_id}
                                                    whileHover={{ scale: 1.01, backgroundColor: "rgba(0,0,0,0.03)" }}
                                                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-6 p-4 rounded-2xl transition-all group hover:border hover:border-border/30 border border-transparent"
                                                >
                                                    <div className="w-8 text-center font-black text-foreground/50 group-hover:text-primary transition-colors">
                                                        #{player.rank}
                                                    </div>

                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-black text-white shrink-0 shadow-inner">
                                                            {player.name?.[0]}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-foreground truncate">{player.name}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                                                <p className="text-[9px] font-bold text-foreground uppercase tracking-wide">P-{player.user_id.slice(-4)}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <div className="inline-block px-3 py-1.5 rounded-lg bg-surface/50 border border-[var(--border)] text-xs font-black text-foreground tabular-nums shadow-sm group-hover:text-primary group-hover:bg-[var(--primary-muted)] transition-colors">
                                                            {player.total_games_played}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )) : (
                                                <div className="py-12 text-center text-foreground text-xs">
                                                    No other players found yet.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="h-[50vh] flex flex-col items-center justify-center text-center p-8"
                            >
                                <div className="w-24 h-24 rounded-full bg-muted/10 flex items-center justify-center mb-6 ring-1 ring-border">
                                    <FiGlobe size={40} className="text-foreground/30" />
                                </div>
                                <h3 className="text-xl font-black text-foreground mb-2">Ghost Town?</h3>
                                <p className="text-xs text-foreground max-w-xs leading-relaxed">
                                    Be the first to play a game in this category and claim the #1 spot immediately!
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </main>
        </>
    );
}