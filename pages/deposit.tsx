"use client";

import Head from "next/head";
import { useUser } from "@/api/session";
import { BRAND, pageTitle } from "@/lib/brand";
import { useWebSocket } from "@/api/game";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCheck,
  FiCopy,
  FiPlus,
  FiRefreshCw,
  FiClipboard,
} from "react-icons/fi";
import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-hot-toast";
import { PaymentMethodLogo } from "@/components/payment/PaymentMethodLogo";
import {
  PAYMENT_METHOD_OPTIONS,
  DEPOSIT_AMOUNT_PRESETS,
  findDepositAccountByKey,
  paymentMethodKeyFromName,
  type PaymentMethodKey,
} from "@/lib/payment-method-options";

interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  owner_name: string;
}

interface UserProfile {
  wallet: number;
  bonus: number;
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

type WalletTab = "Deposit" | "Withdraw" | "History";

const GATEWAY_META: Record<
  PaymentMethodKey,
  { accent: string; pill: string; speed: string; fastLabel: string }
> = {
  telebirr: { accent: "#2563EB", pill: "#EFF6FF", speed: "Fastest", fastLabel: "Telebirr Instant (0%)" },
  cbe_birr: { accent: "#EA580C", pill: "#FFF7ED", speed: "Standard", fastLabel: "CBE Birr" },
  cbe: { accent: "#7C3AED", pill: "#F5F3FF", speed: "Direct", fastLabel: "CBE Direct Birr" },
  mpesa: { accent: "#16A34A", pill: "#F0FDF4", speed: "Safaricom", fastLabel: "M-Pesa" },
  ebirr: { accent: "#0D9488", pill: "#F0FDFA", speed: "Standard", fastLabel: "E-Birr" },
  boa: { accent: "#DC2626", pill: "#FEF2F2", speed: "Bank", fastLabel: "BOA" },
};

export default function DepositPage() {
  const { user, saveUser, apiRequest } = useUser();
  const { isConnected, isReconnecting } = useWebSocket();

  const [activeTab, setActiveTab] = useState<WalletTab>("Deposit");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [depositAccounts, setDepositAccounts] = useState<PaymentMethod[]>([]);
  const [withdrawMethods, setWithdrawMethods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMethodKey, setSelectedMethodKey] = useState<PaymentMethodKey | null>("telebirr");
  const [selectedDepositAccount, setSelectedDepositAccount] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState("100");
  const [transactionSMS, setTransactionSMS] = useState("");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jackpotAmount, setJackpotAmount] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    const res = await apiRequest("/get-profile/", "GET");
    if (res?.ok) {
      const data = await res.json();
      setProfile({ wallet: data.wallet, bonus: data.bonus });
      if (user) saveUser({ ...user, wallet: data.wallet, bonus: data.bonus });
    }
  }, [apiRequest, saveUser, user]);

  const fetchDepositAccounts = useCallback(async () => {
    const res = await apiRequest("/deposit-accounts/", "GET");
    if (res?.ok) {
      const data = await res.json();
      const accounts: PaymentMethod[] = data.accounts || [];
      setDepositAccounts(accounts);
      const telebirr = findDepositAccountByKey("telebirr", accounts);
      if (telebirr) {
        setSelectedMethodKey("telebirr");
        setSelectedDepositAccount(telebirr);
      } else if (accounts[0]) {
        const key = paymentMethodKeyFromName(accounts[0].name) || "telebirr";
        setSelectedMethodKey(key);
        setSelectedDepositAccount(accounts[0]);
      }
    }
  }, [apiRequest]);

  const fetchWithdrawMethods = useCallback(async () => {
    const res = await apiRequest("/online-agent-payment-methods/", "GET");
    if (res?.ok) {
      const data = await res.json();
      setWithdrawMethods(data.payment_methods || []);
    }
  }, [apiRequest]);

  const fetchTransactions = useCallback(
    async (page: number) => {
      setTxLoading(true);
      const res = await apiRequest(`/transaction-history/?page=${page}&limit=10`, "GET");
      if (res?.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTxTotalPages(Math.max(1, Math.ceil((data.total || 0) / 10)));
      }
      setTxLoading(false);
    },
    [apiRequest],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        fetchProfile(),
        fetchDepositAccounts(),
        fetchWithdrawMethods(),
        (async () => {
          const res = await apiRequest("/jackpot/10", "GET");
          if (res?.ok) {
            const data = await res.json();
            if (typeof data.amount === "number") setJackpotAmount(data.amount);
          }
        })(),
      ]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "History") fetchTransactions(txPage);
  }, [activeTab, txPage, fetchTransactions]);

  const walletBalance = Number(profile?.wallet ?? user?.wallet ?? 0);
  const parsedAmount = Number(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const updatedBalance = walletBalance + (validAmount ? parsedAmount : 0);

  const handle = useMemo(() => {
    const name = user?.name || "Player";
    return `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "player"}`;
  }, [user?.name]);

  const ussdCode = useMemo(() => {
    if (!selectedDepositAccount?.account_number || !validAmount) return null;
    if (selectedMethodKey === "telebirr") {
      const phone = selectedDepositAccount.account_number.replace(/\D/g, "");
      return `*127*${phone}*${parsedAmount}#`;
    }
    return null;
  }, [selectedDepositAccount, selectedMethodKey, validAmount, parsedAmount]);

  const handleDepositMethodSelect = (key: PaymentMethodKey) => {
    const account = findDepositAccountByKey(key, depositAccounts);
    if (!account) {
      toast.error("Coming Soon");
      return;
    }
    setSelectedMethodKey(key);
    setSelectedDepositAccount(account);
  };

  const handleWithdrawMethodSelect = (key: PaymentMethodKey) => {
    const methodName = withdrawMethods.find((m) => paymentMethodKeyFromName(m) === key);
    if (!methodName) {
      toast.error("Coming Soon");
      return;
    }
    setSelectedMethodKey(key);
    setSelectedDepositAccount({ id: key, name: methodName, account_number: "", owner_name: "" });
  };

  const copyText = async (text: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy");
    }
  };

  const pasteSms = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setTransactionSMS(text.trim());
        toast.success("SMS pasted");
      } else {
        toast.error("Clipboard is empty");
      }
    } catch {
      toast.error("Allow clipboard access to paste");
    }
  };

  const handleDeposit = async () => {
    if (!selectedDepositAccount) {
      toast.error("Select a payment method");
      return;
    }
    if (!validAmount) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!transactionSMS.trim()) {
      toast.error("Paste the transaction SMS");
      return;
    }
    setIsSubmitting(true);
    const res = await apiRequest("/deposit/", "POST", {
      paymentMethod: selectedDepositAccount.name,
      transactionSMS: transactionSMS.trim(),
    });
    if (res?.ok) {
      toast.success("Deposit request sent!");
      setTransactionSMS("");
      fetchProfile();
    } else {
      const data = await res?.json();
      toast.error(data?.error || "Deposit failed");
    }
    setIsSubmitting(false);
  };

  const handleWithdraw = async () => {
    if (!selectedDepositAccount) {
      toast.error("Select a payment method");
      return;
    }
    if (!validAmount) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!withdrawAccount.trim()) {
      toast.error("Enter your account number");
      return;
    }
    setIsSubmitting(true);
    const res = await apiRequest("/withdraw/", "POST", {
      bank: selectedDepositAccount.name,
      amount: parsedAmount,
      account_number: withdrawAccount.trim(),
    });
    if (res?.ok) {
      toast.success("Withdrawal request submitted!");
      setWithdrawAccount("");
      fetchProfile();
    } else {
      const data = await res?.json();
      toast.error(data?.error || "Withdrawal failed");
    }
    setIsSubmitting(false);
  };

  const serverLabel =
    isConnected && !isReconnecting
      ? "SERVER #04: LIVE | 14ms"
      : isReconnecting
        ? "SERVER #04: RECONNECTING…"
        : "SERVER #04: OFFLINE";

  if (!user) return null;

  return (
    <>
      <Head>
        <title>{pageTitle("Cashier")}</title>
        <meta name="description" content={`Deposit funds into your ${BRAND.name} wallet instantly.`} />
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-sm font-black text-white">
                {BRAND.logoLetter}{BRAND.shortName?.[1]?.toUpperCase() || ""}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-black tracking-tight text-[#2563EB]">
                    {BRAND.name.toUpperCase()}
                  </span>
                  <span className="rounded border border-[#93C5FD] bg-[#EFF6FF] px-1 py-0.5 text-[8px] font-black uppercase text-[#2563EB]">
                    PRO
                  </span>
                </div>
                <p className="truncate text-xs font-medium text-[#94A3B8]">{handle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]">Balance</p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  <span className="text-[10px] text-[#64748B]">ETB</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setActiveTab("Deposit"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="inline-flex items-center gap-0.5 rounded-xl bg-[#2563EB] px-2.5 py-2 text-[11px] font-black text-white"
              >
                <FiPlus size={12} /> Top Up
              </button>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 rounded-2xl bg-[#E8EDF5] p-1">
            {(["Deposit", "Withdraw", "History"] as WalletTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  if (tab !== "Deposit") {
                    setSelectedMethodKey(null);
                    setSelectedDepositAccount(null);
                  }
                }}
                className={`flex-1 rounded-xl py-2.5 text-[11px] font-black transition-all ${
                  activeTab === tab ? "bg-white text-[#2563EB] shadow-sm" : "text-[#64748B]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FiRefreshCw className="animate-spin text-2xl text-[#2563EB]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Loading…</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "Deposit" && (
                  <div className="space-y-3">
                    {/* Fast pay */}
                    <div className="overflow-x-auto no-scrollbar">
                      <div className="flex min-w-max items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">Fast Pay:</span>
                        {PAYMENT_METHOD_OPTIONS.slice(0, 4).map((method) => {
                          const meta = GATEWAY_META[method.id];
                          const active = selectedMethodKey === method.id;
                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => handleDepositMethodSelect(method.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
                                active
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                  : "border-[#E2E8F0] bg-white text-[#64748B]"
                              }`}
                            >
                              <span
                                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white"
                                style={{ backgroundColor: meta.accent }}
                              >
                                {method.label[0]}
                              </span>
                              {meta.fastLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Main cashier card */}
                    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#2563EB]">
                          #DEP-INSTANT
                        </span>
                        <h1 className="text-base font-black text-[#0F172A]">Cashier & Deposit</h1>
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[9px] font-black uppercase text-[#15803D]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                          0% Comm · Instant
                        </span>
                      </div>

                      <div>
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">Choose Gateway</p>
                        <div className="grid grid-cols-4 gap-2">
                          {PAYMENT_METHOD_OPTIONS.slice(0, 4).map((method) => {
                            const meta = GATEWAY_META[method.id];
                            const active = selectedMethodKey === method.id;
                            return (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => handleDepositMethodSelect(method.id)}
                                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all ${
                                  active
                                    ? "border-[#2563EB] bg-[#EFF6FF] shadow-sm"
                                    : "border-[#E2E8F0] bg-[#F8FAFC]"
                                }`}
                              >
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-[#E2E8F0] overflow-hidden"
                                >
                                  <PaymentMethodLogo id={method.id} size={28} />
                                </div>
                                <span className="text-[10px] font-black text-[#0F172A]">{method.label}</span>
                                <span className="text-[8px] font-bold uppercase" style={{ color: meta.accent }}>
                                  {meta.speed}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">Enter Amount</p>
                        <div className="relative flex items-center rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-3">
                          <span className="text-sm font-black text-[#94A3B8]">ETB</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-transparent px-3 py-3.5 text-lg font-black outline-none"
                            placeholder="100"
                          />
                          <button
                            type="button"
                            onClick={() => setAmount("3000")}
                            className="rounded-lg bg-[#2563EB] px-2.5 py-1 text-[10px] font-black text-white"
                          >
                            MAX
                          </button>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {DEPOSIT_AMOUNT_PRESETS.slice(0, 5).map((preset) => {
                            const selected = amount === String(preset);
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setAmount(String(preset))}
                                className={`min-w-[48px] rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                                  selected
                                    ? "border border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                                    : "border border-[#E2E8F0] bg-white text-[#0F172A]"
                                }`}
                              >
                                {preset}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {selectedDepositAccount && (
                        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-wider text-[#64748B]">
                              {selectedDepositAccount.name} Transfer Details
                            </p>
                            <span className="text-[9px] font-black uppercase text-[#2563EB]">Step 1 of 2</span>
                          </div>
                          <div className="flex items-start justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white p-3">
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-black break-all text-[#0F172A]">
                                {selectedDepositAccount.account_number}
                              </p>
                              <p className="mt-0.5 text-xs font-bold text-[#64748B]">
                                {selectedDepositAccount.owner_name}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyText(selectedDepositAccount.account_number, "Account copied")}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-[10px] font-black text-[#64748B]"
                            >
                              <FiCopy size={12} /> Copy
                            </button>
                          </div>
                          <p className="text-[11px] font-medium leading-relaxed text-[#64748B]">
                            Send the exact amount from your {selectedDepositAccount.name} app
                            {ussdCode ? (
                              <>
                                {" "}or dial{" "}
                                <button
                                  type="button"
                                  onClick={() => copyText(ussdCode, "USSD copied")}
                                  className="font-mono font-black text-[#2563EB]"
                                >
                                  {ussdCode}
                                </button>
                              </>
                            ) : null}
                            .
                          </p>
                        </div>
                      )}

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">
                            {selectedDepositAccount?.name || "Payment"} SMS Confirmation
                          </p>
                          <span className="text-[9px] font-black uppercase text-[#94A3B8]">Step 2 of 2</span>
                        </div>
                        <div className="flex gap-2">
                          <textarea
                            rows={3}
                            value={transactionSMS}
                            onChange={(e) => setTransactionSMS(e.target.value)}
                            placeholder={`Paste ${selectedDepositAccount?.name || "payment"} SMS or Trans ID`}
                            className="min-h-[84px] flex-1 resize-y rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm font-medium outline-none focus:border-[#2563EB]"
                          />
                          <button
                            type="button"
                            onClick={pasteSms}
                            className="inline-flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#E2E8F0] bg-white px-3 text-[10px] font-black text-[#64748B]"
                          >
                            <FiClipboard size={16} />
                            Paste SMS
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-[10px] font-black uppercase tracking-wide">
                        <span className="text-[#64748B]">
                          Deposit Credited{" "}
                          <span className="text-[#0F172A]">
                            {validAmount ? parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"} ETB
                          </span>
                        </span>
                        <span className="text-[#15803D]">
                          Updated Balance {updatedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleDeposit}
                        disabled={isSubmitting || !selectedDepositAccount || !validAmount || !transactionSMS.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16A34A] py-4 text-sm font-black uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(22,163,74,0.35)] disabled:opacity-50 active:scale-[0.99] transition-all"
                      >
                        <FiCheck size={18} strokeWidth={3} />
                        {isSubmitting
                          ? "Processing…"
                          : `Confirm Deposit (${validAmount ? parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"} ETB)`}
                      </button>
                    </section>
                  </div>
                )}

                {activeTab === "Withdraw" && (
                  <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-4">
                    <h2 className="text-base font-black text-[#0F172A]">Withdraw</h2>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHOD_OPTIONS.map((method) => {
                        const active = selectedMethodKey === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => handleWithdrawMethodSelect(method.id)}
                            className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 ${
                              active ? "border-[#2563EB] bg-[#EFF6FF]" : "border-[#E2E8F0] bg-[#F8FAFC]"
                            }`}
                          >
                            <PaymentMethodLogo id={method.id} size={32} />
                            <span className="text-[10px] font-bold">{method.label}</span>
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
                      className="w-full rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3.5 text-base font-black outline-none focus:border-[#2563EB]"
                      placeholder="Amount"
                    />
                    <input
                      type="text"
                      value={withdrawAccount}
                      onChange={(e) => setWithdrawAccount(e.target.value)}
                      className="w-full rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3.5 text-base font-black outline-none focus:border-[#2563EB]"
                      placeholder="Your account number"
                    />
                    <button
                      type="button"
                      onClick={handleWithdraw}
                      disabled={isSubmitting}
                      className="w-full rounded-2xl bg-[#2563EB] py-4 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
                    >
                      {isSubmitting ? "Processing…" : "Withdraw"}
                    </button>
                  </section>
                )}

                {activeTab === "History" && (
                  <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-3">
                    <h2 className="text-base font-black text-[#0F172A]">Transactions</h2>
                    {txLoading ? (
                      <div className="py-12 text-center">
                        <FiRefreshCw className="mx-auto animate-spin text-[#2563EB]" />
                      </div>
                    ) : transactions.length === 0 ? (
                      <p className="py-10 text-center text-xs font-bold text-[#94A3B8]">No transactions found</p>
                    ) : (
                      <div className="space-y-2">
                        {transactions.map((tx, i) => {
                          const isDeposit = tx.payment_type === "DEPOSIT";
                          return (
                            <div key={tx.id ?? i} className="flex items-center justify-between rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`rounded-xl p-2 ${isDeposit ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#B91C1C]"}`}>
                                  {isDeposit ? <FiArrowDownLeft size={16} /> : <FiArrowUpRight size={16} />}
                                </div>
                                <div>
                                  <p className="text-sm font-black">{isDeposit ? "Deposit" : "Withdraw"}</p>
                                  <p className="text-[10px] text-[#94A3B8]">
                                    {new Date(tx.created_at).toLocaleDateString(undefined, {
                                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <p className={`text-sm font-black ${isDeposit ? "text-[#15803D]" : "text-[#B91C1C]"}`}>
                                {isDeposit ? "+" : "-"}{Number(tx.amount).toLocaleString()} ETB
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {txTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button type="button" disabled={txPage <= 1} onClick={() => setTxPage((p) => Math.max(1, p - 1))} className="rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold disabled:opacity-40">Prev</button>
                        <span className="text-[10px] font-black text-[#64748B]">{txPage} / {txTotalPages}</span>
                        <button type="button" disabled={txPage >= txTotalPages} onClick={() => setTxPage((p) => p + 1)} className="rounded-xl border border-[#E2E8F0] px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
                      </div>
                    )}
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </>
  );
}
