"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useUser } from "@/api/session";
import { FiUser, FiBarChart2, FiPlay, FiCreditCard, FiInfo } from "react-icons/fi";
import { useWebSocket } from "@/api/game";
import { KineticLoader } from "@/components/KineticLoader";
import { usePromoInfoModal } from "@/components/PromoInfoModalProvider";
import { BRAND } from "@/lib/brand";

const NavBar = () => {
    const router = useRouter();
    const { user } = useUser();
    const { isConnected, isReconnecting } = useWebSocket();
    const { open: openPromoModal, isOpen: promoOpen } = usePromoInfoModal();
    const hideTopHeader =
        router.pathname === "/profile" ||
        router.pathname === "/stats" ||
        router.pathname === "/deposit" ||
        router.pathname === "/stake" ||
        router.pathname.startsWith("/stake/");

    const navItems = [
        { label: "Live", icon: FiPlay, path: "/stake" },
        { label: "Trends", icon: FiBarChart2, path: "/stats" },
        { label: "Cashier", icon: FiCreditCard, path: "/deposit" },
        { label: "Account", icon: FiUser, path: "/profile" },
    ];

    const isPathActive = (path: string) =>
        router.pathname === path || router.pathname.startsWith(path + "/");

    return (
        <>
            {!hideTopHeader && (
                <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-xl bg-[var(--nav-bg)] border-b border-[var(--nav-border)] px-4 md:px-8 py-1 md:py-2">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-[var(--primary-border)] shadow-[0_2px_8px_rgba(var(--primary-rgb),0.25)] group-hover:scale-110 transition-transform shrink-0">
                                <Image
                                    src={BRAND.promoImage}
                                    alt={BRAND.name}
                                    fill
                                    className="object-cover object-center"
                                    sizes="36px"
                                    priority
                                />
                            </div>
                            <span className="text-xl font-black tracking-tighter text-foreground">
                                {BRAND.shortName}<span className="text-primary">Bingo</span>
                            </span>
                        </Link>

                        <div className="flex items-center gap-3">
                            {user && (
                                <button
                                    type="button"
                                    onClick={() => openPromoModal(0)}
                                    className={`relative w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--primary-border)] bg-[var(--primary-muted)] text-primary transition-transform hover:scale-105 active:scale-95 ${!promoOpen ? "promo-info-blink" : ""}`}
                                    aria-label="Info, promotions and winning patterns"
                                    title="Info & promotions"
                                >
                                    <FiInfo className="h-4 w-4" />
                                </button>
                            )}

                            {user && (
                                <div className="hidden sm:flex flex-col items-end px-3 py-1 rounded-xl bg-[var(--overlay-bg)] border border-[var(--overlay-border)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground/90">Wallet</span>
                                    <span className="text-sm font-black text-success">
                                        {Number(user.wallet).toLocaleString()} <span className="text-[10px] opacity-70">ETB</span>
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center">
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all duration-300 bg-[var(--overlay-bg)] border-[var(--overlay-border)]"
                                    title={isConnected ? (isReconnecting ? "Reconnecting…" : "Connected") : "Disconnected"}
                                >
                                    {isConnected && !isReconnecting ? (
                                        <>
                                            <span className="relative flex h-1.5 w-1.5">
                                                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                                            </span>
                                            <span className="text-success">Live</span>
                                        </>
                                    ) : isReconnecting ? (
                                        <>
                                            <KineticLoader variant="dot-pulse" size="sm" className="shrink-0 text-primary" />
                                            <span className="text-primary animate-pulse">Wait</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-1.5 h-1.5 rounded-full bg-error opacity-80" />
                                            <span className="text-error/90">Offline</span>
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                </header>
            )}

            {/* Floating glass dock — elevated pill style on every active item */}
            <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
                <div className="pointer-events-auto relative mx-auto flex max-w-sm items-end justify-between rounded-[2rem] border border-white/80 bg-white/75 px-2 py-2 shadow-[0_16px_48px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
                    <div className="pointer-events-none absolute inset-x-10 -bottom-4 h-8 rounded-full bg-[#2563EB]/20 blur-2xl" />

                    {navItems.map((item) => {
                        const active = isPathActive(item.path);

                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`relative flex min-w-[4.25rem] flex-1 flex-col items-center transition-all duration-300 ${
                                    active ? "-mt-7 text-[#2563EB]" : "text-[#94A3B8] hover:text-[#0F172A]"
                                }`}
                                aria-label={item.label}
                            >
                                <span
                                    className={`relative flex items-center justify-center rounded-full transition-all duration-300 active:scale-95 ${
                                        active
                                            ? "h-[3.5rem] w-[3.5rem] scale-105 bg-gradient-to-br from-[#60A5FA] via-[#2563EB] to-[#1D4ED8] shadow-[0_12px_32px_rgba(37,99,235,0.55)] ring-[3px] ring-[#BFDBFE]"
                                            : "h-10 w-10 bg-transparent group-hover:bg-[#F1F5F9]"
                                    }`}
                                >
                                    {active && (
                                        <span className="absolute inset-[2px] rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                                    )}
                                    <item.icon
                                        className={`relative z-10 transition-all duration-300 ${
                                            active ? "h-6 w-6 text-white" : "h-[1.15rem] w-[1.15rem]"
                                        }`}
                                        strokeWidth={active ? 2.4 : 2}
                                    />
                                </span>
                                <span
                                    className={`mt-1 text-[10px] font-black tracking-wide transition-colors duration-300 ${
                                        active ? "text-[#2563EB]" : "text-[#64748B]"
                                    }`}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
};

export default NavBar;
