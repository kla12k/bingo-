import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useUser } from "@/api/session";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlayCircle, FiList, FiUsers, FiCreditCard, FiArrowLeft, FiMoon, FiSun } from "react-icons/fi";

const navItems = [
    { label: "Invite", icon: FiUsers, path: "/affiliate" },
    { label: "Transactions", icon: FiList, path: "/affiliate/transactions" },
    { label: "Account", icon: FiCreditCard, path: "/affiliate/account" },
    // { label: "Play", icon: FiPlayCircle, path: "/" },
];

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, displayReference, toggleDisplayReference, telegram, refreshUser } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push("/auth/signin");
            } else if (!user.is_affiliate) {
                refreshUser().then((fresh) => {
                    if (!fresh?.is_affiliate) {
                        router.push("/");
                    }
                });
            }
        }
    }, [user, loading, router, refreshUser]);

    if (loading || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col pt-20 pb-28 px-4">
            <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 border-b border-[var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-xl">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link href={telegram ? "/stake" : "/"} className="flex items-center gap-2 group">
                        <div className="p-2 rounded-xl bg-[var(--overlay-bg)] text-foreground hover:scale-110 transition-transform border border-[var(--overlay-border)]">
                            <FiArrowLeft size={20} />
                        </div>
                        <span className="text-sm font-black uppercase tracking-widest text-foreground">Play</span>
                        <div className="w-px h-8 bg-[var(--border)] mx-2" />
                    </Link>

                    <h1 className="text-sm font-black uppercase tracking-[0.3em] text-foreground">Affiliate Portal</h1>

                    <div className="flex items-center gap-2">
                        {/* <span className="text-[10px] font-black uppercase text-muted-foreground mr-2 hidden sm:block">Balance</span>
                        <div className="px-3 py-1 rounded-xl bg-[var(--primary-muted)] border border-[var(--primary-border)]">
                            <span className="text-sm font-black text-primary">{Number(user.affiliate_wallet || 0).toLocaleString()} ETB</span>
                        </div> */}
                        {/* <button
                            onClick={toggleDisplayReference}
                            className={`p-2.5 rounded-xl transition-all border
                            bg-[var(--hover-overlay)] border-[var(--border)] text-primary hover:opacity-90 hover:scale-105
                            `}
                        >
                            {displayReference ? <FiMoon size={20} /> : <FiSun size={20} />}
                        </button> */}
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-4xl w-full mx-auto relative z-10">
                {children}
            </main>

            {/* Bottom Floating Nav */}
            <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
                <div className="rounded-[2rem] p-1.5 flex items-center justify-between shadow-2xl relative overflow-hidden border border-[var(--frosted-border)]" style={{ background: 'var(--frosted-bg)', backdropFilter: 'saturate(180%) blur(24px)', WebkitBackdropFilter: 'saturate(180%) blur(24px)' }}>
                    {navItems.map((item) => {
                        const isActive = router.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl transition-all relative z-10
                                    ${isActive ? "text-primary bg-[var(--primary-muted)] shadow-inner" : "text-muted hover:text-foreground hover:bg-muted/5"}`}
                            >
                                <item.icon size={isActive ? 18 : 16} className={isActive ? "animate-pulse" : ""} />
                                <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? "opacity-100" : "opacity-60"}`}>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}