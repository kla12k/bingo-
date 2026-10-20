"use client";

import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { motion } from "framer-motion";
import { useUser } from "@/api/session";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { KineticLoader } from "@/components/KineticLoader";

export default function SignIn() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"phone" | "password" | null>(null);
  const router = useRouter();
  const { saveUser, saveTokens } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/v2/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber, password }),
      });

      if (response.ok) {
        const data = await response.json();
        saveUser(data.user);
        saveTokens(data.tokens);
        router.push("/");
      } else {
        const errData = await response.json();
        setError(errData.detail || "Login failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      <Head>
        <title>Sign in — {BRAND.name}</title>
      </Head>
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(var(--primary-rgb), 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 100% 100%, rgba(var(--accent-rgb), 0.12) 0%, transparent 50%),
            radial-gradient(ellipse 50% 30% at 0% 80%, rgba(var(--primary-rgb), 0.08) 0%, transparent 50%),
            var(--bg)
          `,
        }}
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(128,128,128,0.04)_0%,transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden">
          {/* Header with branding */}
          <div className="relative px-8 pt-10 pb-6 text-center">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.35 }}
              className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-black font-black text-2xl shadow-lg shadow-primary/30 mb-4"
            >
              A
            </motion.div>
            <h1 className="relative text-2xl font-black tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="relative mt-1 text-sm text-muted-foreground">
              Sign in to <span className="font-bold text-primary">{BRAND.nameCompact}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            {/* Phone input */}
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-1.5"
            >
              <label className="block text-sm font-semibold text-foreground">
                Phone number
              </label>
              <div
                className={`
                  flex items-center gap-3 rounded-xl border-2 bg-[var(--overlay-bg)] px-4 py-3 transition-all duration-200
                  ${focusedField === "phone"
                    ? "border-primary shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.2)]"
                    : "border-border hover:border-muted"
                  }
                `}
              >
                <span className="text-muted-foreground" aria-hidden>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onFocus={() => setFocusedField("phone")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. 0912345678"
                  className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-base"
                  required
                />
              </div>
            </motion.div>

            {/* Password input */}
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
              className="space-y-1.5"
            >
              <label className="block text-sm font-semibold text-foreground">
                Password
              </label>
              <div
                className={`
                  flex items-center gap-3 rounded-xl border-2 bg-[var(--overlay-bg)] px-4 py-3 transition-all duration-200
                  ${focusedField === "password"
                    ? "border-primary shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.2)]"
                    : "border-border hover:border-muted"
                  }
                `}
              >
                <span className="text-muted-foreground" aria-hidden>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-base"
                  required
                />
              </div>
            </motion.div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-sm text-error bg-[var(--error-muted)] border border-[var(--error-border)] rounded-lg px-4 py-2.5"
              >
                <span aria-hidden>
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </span>
                {error}
              </motion.p>
            )}

            {/* Submit */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl font-bold text-base bg-gradient-to-r from-primary to-primary-hover text-black shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border-0 disabled:opacity-70 disabled:hover:scale-100"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span style={{ ['--bingo' as string]: '#1a1a1a' } as React.CSSProperties}>
                      <KineticLoader variant="dots" size="sm" />
                    </span>
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </motion.div>

            {/* Sign up link */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-center pt-2"
            >
              <span className="text-sm text-muted-foreground">Don&apos;t have an account? </span>
              <Link
                href="/auth/signup"
                className="text-sm font-semibold text-primary hover:opacity-90 transition-colors"
              >
                Sign up
              </Link>
            </motion.p>
          </form>
        </div>
      </motion.div>
    </div>
  );
}