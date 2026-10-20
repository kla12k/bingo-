"use client";

import Head from "next/head";
import { useUser } from "@/api/session";
import { BRAND, pageTitle } from "@/lib/brand";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import { disconnectSocket } from "@/lib/socket";
import { useWebSocket } from "@/api/game";
import {
    FiPhone, FiStar,
    FiEdit2, FiArrowUpRight, FiArrowDownLeft,
    FiSend, FiClock, FiX, FiCheck, FiChevronLeft, FiChevronRight,
    FiActivity, FiRefreshCw, FiDollarSign, FiGift,
    FiPlus, FiLock, FiTrendingUp, FiTag,
} from "react-icons/fi";
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-hot-toast";
import { PaymentMethodLogo } from "@/components/payment/PaymentMethodLogo";
import {
    PAYMENT_METHOD_OPTIONS,
    DEPOSIT_AMOUNT_PRESETS,
    findDepositAccountByKey,
    paymentMethodKeyFromName,
    type PaymentMethodKey,
} from "@/lib/payment-method-options";

interface UserProfile {
    name: string;
    phone_number: string;
    wallet: number;
    bonus: number;
    date_joined: string;
    is_verified: boolean;
}

interface PaymentMethod {
    id: string;
    name: string;
    account_number: string;
    owner_name: string;
}

interface Transaction {
    id: string;
    reference_id?: string | null;
    payment_type: string;
    payment_status: string;
    amount: number;
    payment_method: string | null;
    created_at: string;
}

interface Transfer {
    id: string;
    direction: "Sent" | "Received";
    fromUserId: string;
    fromName: string;
    toUserId: string;
    toName: string;
    amount: number;
    created_at: string;
}

interface UserStats {
    total_wins: number;
    total_games_played: number;
    total_deposit: number;
    total_withdrawal: number;
}

type TreasuryTab = "Deposit" | "Withdraw" | "Transfer" | "History" | "Coupon";

export default function ProfilePage() {
    const router = useRouter();
    const { user, saveUser, apiRequest, clearUser, clearTokens } = useUser();
    const { isConnected, isReconnecting } = useWebSocket();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [jackpotAmount, setJackpotAmount] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<TreasuryTab>("Deposit");
    const [historyTab, setHistoryTab] = useState<"Transactions" | "Transfers">("Transactions");
    const [showTreasuryPanel, setShowTreasuryPanel] = useState(false);

    const handleLogout = () => {
        disconnectSocket();
        clearTokens();
        clearUser();
        router.push("/auth/signin");
    };

    const [activeModal, setActiveModal] = useState<"Deposit" | "Withdraw" | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState("");
    const [inputValue, setInputValue] = useState("");
    const [recipientPhone, setRecipientPhone] = useState("");
    const [targetAccount, setTargetAccount] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedMethodKey, setSelectedMethodKey] = useState<PaymentMethodKey | null>(null);
    const [amount, setAmount] = useState("100");
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [withdrawMethods, setWithdrawMethods] = useState<string[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [couponCode, setCouponCode] = useState("");
    const [couponClaiming, setCouponClaiming] = useState(false);
    const [couponHistory, setCouponHistory] = useState<{ id: string; code: string; description: string | null; rewardType: string; rewardValue: number; claimedAt: string }[]>([]);
    const [couponHistoryLoading, setCouponHistoryLoading] = useState(false);

    useEffect(() => {
        fetchProfile();
        fetchDepositMethods();
        fetchWithdrawMethods();
        fetchStats();
        fetchJackpot();
    }, []);

    useEffect(() => {
        if (activeTab === "History" && showTreasuryPanel) {
            if (historyTab === "Transactions") fetchTransactionHistory(page);
            else fetchTransferHistory(page);
        }
    }, [activeTab, historyTab, page, showTreasuryPanel]);

    useEffect(() => {
        if (activeTab === "Coupon" && showTreasuryPanel) fetchCouponHistory();
    }, [activeTab, showTreasuryPanel]);

    const fetchProfile = async () => {
        const res = await apiRequest("/get-profile/", "GET");
        if (res?.ok) {
            const data = await res.json();
            setProfile(data);
            if (user) {
                saveUser({ ...user, name: data.name, wallet: data.wallet, bonus: data.bonus });
            }
        }
    };

    const fetchStats = async () => {
        const res = await apiRequest("/user/stats/", "GET");
        if (res?.ok) {
            setStats(await res.json());
        }
    };

    const fetchJackpot = async () => {
        const res = await apiRequest("/jackpot/10", "GET");
        if (res?.ok) {
            const data = await res.json();
            if (typeof data.amount === "number") setJackpotAmount(data.amount);
        }
    };

    const fetchDepositMethods = async () => {
        const res = await apiRequest("/deposit-accounts/", "GET");
        if (res?.ok) {
            const data = await res.json();
            setPaymentMethods(data.accounts || []);
        }
    };

    const fetchWithdrawMethods = async () => {
        const res = await apiRequest("/online-agent-payment-methods/", "GET");
        if (res?.ok) {
            const data = await res.json();
            setWithdrawMethods(data.payment_methods || []);
        }
    };

    const fetchTransactionHistory = async (p: number) => {
        setHistoryLoading(true);
        const res = await apiRequest(`/transaction-history/?page=${p}&limit=10`, "GET");
        if (res?.ok) {
            const data = await res.json();
            setTransactions(data.transactions || []);
            setTotalPages(Math.ceil((data.total || 0) / 10));
        }
        setHistoryLoading(false);
    };

    const fetchTransferHistory = async (p: number) => {
        setHistoryLoading(true);
        const res = await apiRequest(`/transfer-history/?page=${p}&limit=10`, "GET");
        if (res?.ok) {
            const data = await res.json();
            setTransfers(data.transfers || []);
            setTotalPages(Math.ceil((data.total || 0) / 10));
        }
        setHistoryLoading(false);
    };

    const fetchCouponHistory = async () => {
        setCouponHistoryLoading(true);
        const res = await apiRequest("/coupons/history", "GET");
        if (res?.ok) {
            const data = await res.json();
            setCouponHistory(data.history || []);
        }
        setCouponHistoryLoading(false);
    };

    const handleClaimCoupon = async () => {
        const code = couponCode.trim();
        if (!code) {
            toast.error("Enter a coupon code");
            return;
        }
        setCouponClaiming(true);
        const res = await apiRequest("/coupons/claim", "POST", { code });
        const data = await res?.json().catch(() => ({}));
        if (res?.ok && data?.success) {
            toast.success(data?.message || "Coupon claimed! Bonus added.");
            setCouponCode("");
            fetchProfile();
            fetchCouponHistory();
        } else {
            toast.error(data?.error || "Could not claim coupon");
        }
        setCouponClaiming(false);
    };

    const handleUpdateName = async () => {
        if (!editedName.trim()) return;
        setIsSubmitting(true);
        const res = await apiRequest("/update-profile/", "POST", { name: editedName });
        if (res?.ok) {
            toast.success("Name updated!");
            fetchProfile();
            setIsEditingName(false);
        } else {
            toast.error("Failed to update name");
        }
        setIsSubmitting(false);
    };

    const handleDeposit = async () => {
        if (!selectedMethod || !inputValue) return;
        setIsSubmitting(true);
        const res = await apiRequest("/deposit/", "POST", {
            paymentMethod: selectedMethod.name,
            transactionSMS: inputValue.trim(),
        });
        if (res?.ok) {
            toast.success("Deposit request sent!");
            setActiveModal(null);
            setInputValue("");
        } else {
            const data = await res?.json();
            toast.error(data?.error || "Deposit failed");
        }
        setIsSubmitting(false);
    };

    const handleWithdraw = async () => {
        if (!selectedMethod) {
            toast.error("Select a payment method");
            return;
        }
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast.error("Enter a valid amount");
            return;
        }
        if (!targetAccount.trim()) {
            toast.error("Enter your account number");
            return;
        }
        setIsSubmitting(true);
        const res = await apiRequest("/withdraw/", "POST", {
            bank: selectedMethod.name,
            amount: parsed,
            account_number: targetAccount.trim(),
        });
        if (res?.ok) {
            toast.success("Withdrawal request submitted!");
            setActiveModal(null);
            setTargetAccount("");
            fetchProfile();
        } else {
            const data = await res?.json();
            toast.error(data?.error || "Withdrawal failed");
        }
        setIsSubmitting(false);
    };

    const handleTransfer = async () => {
        if (!recipientPhone || !inputValue) return;
        setIsSubmitting(true);
        const res = await apiRequest("/transfer/", "POST", {
            to_phone: recipientPhone,
            amount: inputValue,
        });
        if (res?.ok) {
            toast.success("Transfer successful!");
            setInputValue("");
            setRecipientPhone("");
            fetchProfile();
        } else {
            const data = await res?.json();
            toast.error(data?.error || "Transfer failed");
        }
        setIsSubmitting(false);
    };

    const handleDepositMethodSelect = (key: PaymentMethodKey) => {
        const account = findDepositAccountByKey(key, paymentMethods);
        if (!account) {
            toast.error("Coming Soon");
            return;
        }
        setSelectedMethodKey(key);
        setSelectedMethod(account);
    };

    const handleWithdrawMethodSelect = (key: PaymentMethodKey) => {
        const methodName = withdrawMethods.find((m) => paymentMethodKeyFromName(m) === key);
        if (!methodName) {
            toast.error("Coming Soon");
            return;
        }
        setSelectedMethodKey(key);
        setSelectedMethod({ id: key, name: methodName, account_number: "", owner_name: "" });
    };

    const openDepositModal = () => {
        if (!selectedMethod) {
            toast.error("Select a payment method");
            return;
        }
        const parsed = Number(amount);
        if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
            toast.error("Enter a valid amount");
            return;
        }
        setInputValue("");
        setActiveModal("Deposit");
    };

    const openTreasury = (tab: TreasuryTab) => {
        setActiveTab(tab);
        setPage(1);
        setSelectedMethodKey(null);
        setSelectedMethod(null);
        setShowTreasuryPanel(true);
    };

    const derived = useMemo(() => {
        const name = profile?.name || user?.name || "Player";
        const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() || "")
            .join("") || "WB";
        const handle = `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "player"}`;
        const wallet = Number(profile?.wallet ?? user?.wallet ?? 0);
        const bonus = Number(profile?.bonus ?? user?.bonus ?? 0);
        const netEquity = wallet + bonus;
        const wins = stats?.total_wins ?? 0;
        const games = stats?.total_games_played ?? 0;
        const winRatio = games > 0 ? (wins / games) * 100 : 0;
        const deposits = Number(stats?.total_deposit ?? 0);
        const withdrawals = Number(stats?.total_withdrawal ?? 0);
        const netReturn = deposits > 0 ? withdrawals + wallet + bonus - deposits : wallet + bonus - deposits;
        const roi = deposits > 0 ? ((netReturn) / deposits) * 100 : 0;
        const uid = String(user?.id || "").replace(/\D/g, "").slice(-6) || "000000";
        return { name, initials, handle, wallet, bonus, netEquity, wins, games, winRatio, deposits, withdrawals, netReturn, roi, uid };
    }, [profile, user, stats]);

    if (!user || !profile) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <FiRefreshCw className="animate-spin text-2xl text-[#2563EB]" />
            </div>
        );
    }

    const serverLabel = isConnected && !isReconnecting
        ? "SERVER #04: LIVE | 14ms"
        : isReconnecting
            ? "SERVER #04: RECONNECTING…"
            : "SERVER #04: OFFLINE";

    return (
        <>
            <Head>
                <title>{pageTitle("Account")}</title>
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
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-sm font-black text-white shadow-sm">
                                {BRAND.logoLetter}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[15px] font-black tracking-tight text-[#0F172A]">
                                        {BRAND.name.toUpperCase()}
                                    </span>
                                    <span className="rounded border border-[#2563EB]/40 px-1 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#2563EB]">
                                        PRO
                                    </span>
                                </div>
                                <p className="truncate text-xs font-medium text-[#94A3B8]">{derived.handle}</p>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2 shadow-sm text-right">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">Balance</p>
                            <p className="text-sm font-black tabular-nums text-[#0F172A]">
                                {derived.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                <span className="text-[10px] text-[#64748B]">ETB</span>
                            </p>
                            <button
                                type="button"
                                onClick={() => openTreasury("Deposit")}
                                className="mt-1 inline-flex items-center gap-0.5 rounded-lg bg-[#2563EB] px-2 py-0.5 text-[10px] font-black text-white"
                            >
                                <FiPlus size={10} /> Top Up
                            </button>
                        </div>
                    </div>

                    {/* Client Terminal Spec */}
                    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">
                                Client Terminal Spec
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                    profile.is_verified
                                        ? "bg-[#DCFCE7] text-[#15803D]"
                                        : "bg-[#FEE2E2] text-[#B91C1C]"
                                }`}>
                                    <FiCheck size={10} />
                                    {profile.is_verified ? "KYC Level 2" : "KYC Pending"}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-[#15803D]">
                                    <FiLock size={10} /> Escrow Secure
                                </span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563EB] text-lg font-black text-white">
                                    {derived.initials}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setEditedName(profile.name); setIsEditingName(true); }}
                                    className="absolute -bottom-1 -right-1 rounded-full border border-[#E2E8F0] bg-white p-1 text-[#64748B] shadow-sm"
                                >
                                    <FiEdit2 size={10} />
                                </button>
                            </div>

                            <div className="min-w-0 flex-1">
                                {isEditingName ? (
                                    <div className="mb-1 flex items-center gap-1.5">
                                        <input
                                            className="w-full rounded-lg border border-[#CBD5E1] px-2 py-1 text-sm font-bold outline-none focus:border-[#2563EB]"
                                            value={editedName}
                                            onChange={(e) => setEditedName(e.target.value)}
                                            autoFocus
                                        />
                                        <button type="button" onClick={handleUpdateName} className="rounded-lg bg-[#2563EB] p-1.5 text-white">
                                            <FiCheck size={14} />
                                        </button>
                                        <button type="button" onClick={() => setIsEditingName(false)} className="rounded-lg bg-[#F1F5F9] p-1.5 text-[#64748B]">
                                            <FiX size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-base font-black text-[#0F172A]">{derived.handle}</h1>
                                        <span className="rounded-md bg-[#EFF6FF] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2563EB]">
                                            Pro Tier 3
                                        </span>
                                    </div>
                                )}
                                <p className="text-[11px] font-semibold text-[#94A3B8]">
                                    UID: #{derived.uid} · ETHIOPIA HQ
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-[#64748B]">
                                    <FiPhone size={11} className="text-[#2563EB]" />
                                    {profile.phone_number}
                                </p>
                            </div>

                            <div className="shrink-0 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-2 text-right">
                                <p className="text-[8px] font-black uppercase tracking-wider text-[#2563EB]">Net Equity</p>
                                <p className="text-sm font-black tabular-nums text-[#2563EB]">
                                    {derived.netEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-[8px] font-bold uppercase text-[#60A5FA]">ETB Liquid</p>
                            </div>
                        </div>
                    </section>

                    {/* Stats 2x2 */}
                    <section className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Win Ratio</p>
                                <FiTrendingUp size={14} className="text-[#22C55E]" />
                            </div>
                            <p className="text-xl font-black tabular-nums text-[#0F172A]">
                                {derived.winRatio.toFixed(1)}%
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                                <div
                                    className="h-full rounded-full bg-[#22C55E]"
                                    style={{ width: `${Math.min(100, derived.winRatio)}%` }}
                                />
                            </div>
                            <p className="mt-1.5 text-[10px] font-semibold text-[#64748B]">
                                {derived.wins} Won / {derived.games} Total
                            </p>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Pro Standing</p>
                                <FiStar size={14} className="text-[#F59E0B]" />
                            </div>
                            <p className="text-xl font-black tabular-nums text-[#0F172A]">
                                #{Math.max(1, 200 - derived.wins)}
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
                                <div className="h-full w-[72%] rounded-full bg-[#F59E0B]" />
                            </div>
                            <p className="mt-1.5 text-[10px] font-semibold text-[#64748B]">Top terminal rank</p>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Settled Rounds</p>
                                <FiClock size={14} className="text-[#64748B]" />
                            </div>
                            <p className="text-xl font-black tabular-nums text-[#0F172A]">{derived.games}</p>
                            <p className="mt-2 text-[10px] font-semibold text-[#64748B]">Avg cards / round</p>
                            <p className="text-[10px] font-bold text-[#22C55E]">Live history synced</p>
                        </div>

                        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Total Net Return</p>
                                <FiDollarSign size={14} className="text-[#22C55E]" />
                            </div>
                            <p className={`text-xl font-black tabular-nums ${derived.netReturn >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                                {derived.netReturn >= 0 ? "+" : ""}
                                {derived.netReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                            <p className="mt-2 text-[10px] font-semibold text-[#64748B]">ETB Historical Yield</p>
                            <p className="text-[10px] font-bold text-[#22C55E]">
                                ROI {derived.roi >= 0 ? "+" : ""}{derived.roi.toFixed(1)}%
                            </p>
                        </div>
                    </section>

                    {/* Treasury Operations */}
                    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3.5 shadow-sm">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">
                                Treasury Operations
                            </p>
                            <p className="text-[10px] font-bold text-[#2563EB]">Telebirr Integrated</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { tab: "Deposit" as const, label: "Deposit", sub: "Instant", icon: FiPlus, active: true },
                                { tab: "Withdraw" as const, label: "Withdraw", sub: "0% Fee", icon: FiArrowDownLeft, active: false },
                                { tab: "Transfer" as const, label: "P2P Move", sub: "Zero Gas", icon: FiSend, active: false },
                                { tab: "Coupon" as const, label: "Coupon", sub: "Redeem", icon: FiTag, active: false },
                            ].map((item) => {
                                const selected = showTreasuryPanel && activeTab === item.tab;
                                return (
                                    <button
                                        key={item.tab}
                                        type="button"
                                        onClick={() => openTreasury(item.tab)}
                                        className="flex flex-col items-center gap-1.5"
                                    >
                                        <div
                                            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
                                                selected || (item.active && !showTreasuryPanel)
                                                    ? "bg-[#2563EB] text-white"
                                                    : "bg-[#F1F5F9] text-[#64748B]"
                                            }`}
                                        >
                                            <item.icon size={20} />
                                        </div>
                                        <span className="text-[11px] font-black text-[#0F172A]">{item.label}</span>
                                        <span className="text-[9px] font-semibold text-[#94A3B8]">{item.sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Expandable treasury panel */}
                    <AnimatePresence>
                        {showTreasuryPanel && (
                            <motion.section
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
                            >
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-[#0F172A]">{activeTab}</h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openTreasury("History")}
                                            className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase ${
                                                activeTab === "History" ? "bg-[#EFF6FF] text-[#2563EB]" : "text-[#94A3B8]"
                                            }`}
                                        >
                                            History
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowTreasuryPanel(false)}
                                            className="rounded-full bg-[#F1F5F9] p-1.5 text-[#64748B]"
                                        >
                                            <FiX size={14} />
                                        </button>
                                    </div>
                                </div>

                                {activeTab === "Deposit" && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-2">
                                            {PAYMENT_METHOD_OPTIONS.map((method) => {
                                                const isSelected = selectedMethodKey === method.id;
                                                return (
                                                    <button
                                                        key={method.id}
                                                        type="button"
                                                        onClick={() => handleDepositMethodSelect(method.id)}
                                                        className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 transition-all ${
                                                            isSelected
                                                                ? "border-[#2563EB] bg-[#EFF6FF] shadow-sm"
                                                                : "border-[#E2E8F0] bg-[#F8FAFC]"
                                                        }`}
                                                    >
                                                        <PaymentMethodLogo id={method.id} size={36} />
                                                        <span className="text-[10px] font-bold text-[#0F172A]">{method.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-base font-bold outline-none focus:border-[#2563EB]"
                                            placeholder="Amount"
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            {DEPOSIT_AMOUNT_PRESETS.map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setAmount(String(preset))}
                                                    className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                                                        amount === String(preset)
                                                            ? "bg-[#2563EB] text-white"
                                                            : "bg-[#F1F5F9] text-[#0F172A]"
                                                    }`}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={openDepositModal}
                                            disabled={isSubmitting}
                                            className="w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
                                        >
                                            {isSubmitting ? "Processing..." : "Deposit"}
                                        </button>
                                    </div>
                                )}

                                {activeTab === "Withdraw" && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-2">
                                            {PAYMENT_METHOD_OPTIONS.map((method) => {
                                                const isSelected = selectedMethodKey === method.id;
                                                return (
                                                    <button
                                                        key={method.id}
                                                        type="button"
                                                        onClick={() => handleWithdrawMethodSelect(method.id)}
                                                        className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 transition-all ${
                                                            isSelected
                                                                ? "border-[#2563EB] bg-[#EFF6FF] shadow-sm"
                                                                : "border-[#E2E8F0] bg-[#F8FAFC]"
                                                        }`}
                                                    >
                                                        <PaymentMethodLogo id={method.id} size={36} />
                                                        <span className="text-[10px] font-bold text-[#0F172A]">{method.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-base font-bold outline-none focus:border-[#2563EB]"
                                            placeholder="Amount"
                                        />
                                        <input
                                            type="text"
                                            value={targetAccount}
                                            onChange={(e) => setTargetAccount(e.target.value)}
                                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-base font-bold outline-none focus:border-[#2563EB]"
                                            placeholder="Your account number"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleWithdraw}
                                            disabled={isSubmitting}
                                            className="w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
                                        >
                                            {isSubmitting ? "Processing..." : "Withdraw"}
                                        </button>
                                    </div>
                                )}

                                {activeTab === "Transfer" && (
                                    <div className="space-y-3">
                                        <input
                                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold outline-none focus:border-[#2563EB]"
                                            placeholder="Recipient phone"
                                            value={recipientPhone}
                                            onChange={(e) => setRecipientPhone(e.target.value)}
                                        />
                                        <input
                                            type="number"
                                            className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold outline-none focus:border-[#2563EB]"
                                            placeholder="Amount"
                                            value={inputValue}
                                            onChange={(e) => setInputValue(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleTransfer}
                                            disabled={isSubmitting}
                                            className="w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
                                        >
                                            {isSubmitting ? "Sending..." : "Confirm P2P"}
                                        </button>
                                    </div>
                                )}

                                {activeTab === "Coupon" && (
                                    <div className="space-y-4">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="e.g. WELCOME10"
                                                value={couponCode}
                                                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                                className="flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold uppercase outline-none focus:border-[#2563EB]"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleClaimCoupon}
                                                disabled={couponClaiming || !couponCode.trim()}
                                                className="rounded-xl bg-[#2563EB] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                                            >
                                                {couponClaiming ? "..." : "Claim"}
                                            </button>
                                        </div>
                                        {couponHistoryLoading ? (
                                            <p className="text-center text-xs text-[#94A3B8]">Loading…</p>
                                        ) : couponHistory.length === 0 ? (
                                            <p className="text-center text-xs font-bold text-[#94A3B8]">No coupons claimed yet</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {couponHistory.map((c) => (
                                                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                                                        <div className="flex items-center gap-2">
                                                            <FiGift className="text-[#2563EB]" size={14} />
                                                            <div>
                                                                <p className="text-sm font-black">{c.code}</p>
                                                                <p className="text-[10px] text-[#94A3B8]">{c.description || `+${c.rewardValue}`}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-black text-[#2563EB]">+{c.rewardValue}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === "History" && (
                                    <div className="space-y-3">
                                        <div className="flex gap-1 rounded-xl bg-[#F1F5F9] p-1">
                                            {(["Transactions", "Transfers"] as const).map((tab) => (
                                                <button
                                                    key={tab}
                                                    type="button"
                                                    onClick={() => { setHistoryTab(tab); setPage(1); }}
                                                    className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase ${
                                                        historyTab === tab ? "bg-white text-[#2563EB] shadow-sm" : "text-[#94A3B8]"
                                                    }`}
                                                >
                                                    {tab}
                                                </button>
                                            ))}
                                        </div>
                                        {historyLoading ? (
                                            <div className="py-8 text-center">
                                                <FiRefreshCw className="mx-auto animate-spin text-[#2563EB]" />
                                            </div>
                                        ) : historyTab === "Transactions" ? (
                                            <div className="space-y-2">
                                                {transactions.length === 0 ? (
                                                    <p className="py-6 text-center text-xs font-bold text-[#94A3B8]">No transactions found</p>
                                                ) : (
                                                    transactions.map((tx, i) => {
                                                        const isDeposit = tx.payment_type === "DEPOSIT";
                                                        const statusLabel = tx.payment_status === "ACCEPTED" ? "Approved" : tx.payment_status === "PENDING" ? "Pending" : "Rejected";
                                                        return (
                                                            <div key={i} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`rounded-lg p-2 ${isDeposit ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#B91C1C]"}`}>
                                                                        {isDeposit ? <FiArrowDownLeft size={14} /> : <FiArrowUpRight size={14} />}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-black">{isDeposit ? "Deposit" : "Withdraw"}</p>
                                                                        <p className="text-[10px] text-[#94A3B8]">
                                                                            {new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className={`text-sm font-black ${isDeposit ? "text-[#15803D]" : "text-[#B91C1C]"}`}>
                                                                        {isDeposit ? "+" : "-"}{Number(tx.amount).toLocaleString()}
                                                                    </p>
                                                                    <span className="text-[8px] font-black uppercase text-[#94A3B8]">{statusLabel}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {transfers.length === 0 ? (
                                                    <p className="py-6 text-center text-xs font-bold text-[#94A3B8]">No transfers found</p>
                                                ) : (
                                                    transfers.map((tr, i) => (
                                                        <div key={i} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                                                            <div>
                                                                <p className="text-sm font-black">
                                                                    {tr.direction === "Received" ? "From" : "To"}{" "}
                                                                    {tr.direction === "Received" ? tr.fromName : tr.toName}
                                                                </p>
                                                                <p className="text-[10px] text-[#94A3B8]">
                                                                    {new Date(tr.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                </p>
                                                            </div>
                                                            <p className="text-sm font-black text-[#2563EB]">
                                                                {tr.direction === "Received" ? "+" : "-"}{Number(tr.amount).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-center gap-3 pt-2">
                                                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-[#E2E8F0] p-2 disabled:opacity-30">
                                                    <FiChevronLeft size={14} />
                                                </button>
                                                <span className="text-[10px] font-black text-[#64748B]">Page {page} / {totalPages}</span>
                                                <button type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-[#E2E8F0] p-2 disabled:opacity-30">
                                                    <FiChevronRight size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.section>
                        )}
                    </AnimatePresence>

                    {/* Support + logout */}
                    <section className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
                        <h4 className="text-sm font-black text-[#0F172A]">Help Center</h4>
                        <p className="mt-1 text-xs font-medium text-[#64748B]">Need assistance? Support is online 24/7.</p>
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => window.open(`https://t.me/${BRAND.supportTelegram}`, "_blank")}
                                className="flex-1 rounded-xl bg-[#2563EB] py-2.5 text-[10px] font-black uppercase tracking-widest text-white"
                            >
                                Contact Support
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#64748B]"
                            >
                                Logout
                            </button>
                        </div>
                    </section>
                </div>

                {/* Deposit confirm modal */}
                <AnimatePresence>
                    {activeModal === "Deposit" && selectedMethod && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-md"
                            onClick={() => setActiveModal(null)}
                        >
                            <motion.div
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 40, opacity: 0 }}
                                className="relative w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className="absolute right-4 top-4 rounded-full bg-[#F1F5F9] p-1.5 text-[#64748B]"
                                >
                                    <FiX size={18} />
                                </button>
                                <h3 className="pr-8 text-xl font-black text-[#0F172A]">
                                    Deposit {Number(amount).toLocaleString()} ETB
                                </h3>
                                <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
                                    via {selectedMethod.name}
                                </p>
                                <div className="mb-3 grid grid-cols-2 gap-2">
                                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                                        <p className="mb-1 text-[10px] font-black uppercase text-[#94A3B8]">Account No.</p>
                                        <p className="break-all text-sm font-bold">{selectedMethod.account_number}</p>
                                    </div>
                                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                                        <p className="mb-1 text-[10px] font-black uppercase text-[#94A3B8]">Name</p>
                                        <p className="truncate text-sm font-bold">{selectedMethod.owner_name}</p>
                                    </div>
                                </div>
                                <p className="mb-2 text-xs text-[#64748B]">
                                    Transfer <strong className="text-[#2563EB]">{Number(amount).toLocaleString()} ETB</strong>, then paste the SMS below.
                                </p>
                                <textarea
                                    rows={4}
                                    className="mb-3 min-h-[100px] w-full resize-y rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm outline-none focus:border-[#2563EB]"
                                    placeholder="Paste transaction SMS here"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                />
                                <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-3">
                                    <FiActivity className="mt-0.5 shrink-0 text-[#2563EB]" size={14} />
                                    <p className="text-xs text-[#64748B]">If the deposit fails, try again after a few minutes.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDeposit}
                                    disabled={isSubmitting || !inputValue.trim()}
                                    className="w-full rounded-xl bg-[#2563EB] py-3.5 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50"
                                >
                                    {isSubmitting ? "Processing..." : "Confirm Deposit"}
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </>
    );
}
