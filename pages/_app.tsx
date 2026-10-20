import type { AppProps } from "next/app";
import "@/styles/globals.css";
import * as Sentry from "@sentry/nextjs";
import NavBar from "@/components/NavBar";
import { KineticLoader } from "@/components/KineticLoader";
import { WebSocketProvider } from "@/api/game";
import { UserProvider, useUser } from "@/api/session";
import { GameProvider } from "@/api/gameId";
import { GroupGameProvider } from "@/api/groupId";
import { useRouter } from "next/router";
import React from "react";
import { Toaster } from 'react-hot-toast';
import WorkingHoursGate from "@/components/WorkingHoursGate";
import { PromoInfoModalProvider } from "@/components/PromoInfoModalProvider";
import { BRAND } from "@/lib/brand";

const LayoutLoader = ({ children }: { children: React.ReactNode }) => {
  const { loading, telegramLoading, displayReference, telegram, user } = useUser();
  const router = useRouter();
  const pathname = router.pathname;
  const isAuthenticated = !!user;

  const HIDE_NAV_ROUTES = [
    "/auth/signin",
    "/auth/login",
    "/auth/signup",
    "/auth/verify",
    "/play",
    "/instructions",
    "/affiliate/transactions",
    "/affiliate/account",
    "/affiliate",
    "/playwithfriends/bingo",
    "/play/[stake]",
    "/play/[stake]/[pattern]",
    "/game/[code]",
    "/group",
    "/weekly/history",
    "/weekly/[editionId]/play",
  ];

  const hideNav =
    HIDE_NAV_ROUTES.includes(pathname) ||
    pathname.startsWith("/affiliate/referrals/") ||
    pathname.startsWith("/weekly/");

  const showNav = !hideNav;

  if (loading || telegramLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <div className="flex flex-col items-center gap-6">
          <KineticLoader variant="ring" size="lg" />
          <p className="text-muted-foreground font-medium animate-pulse">
            {telegramLoading ? "Authenticating with Telegram..." : `Loading ${BRAND.name}...`}
          </p>
        </div>
      </div>
    );
  }

  const isTelegram = !!telegram;

  return (
    <PromoInfoModalProvider autoShow={showNav && isAuthenticated} enabled={isAuthenticated}>
      <div
        data-theme={displayReference ? "dark" : "light"}
        className={
          isTelegram
            ? "fixed inset-0 w-full h-full overflow-auto transition-colors duration-300 bg-background text-foreground"
            : "min-h-screen transition-colors duration-300 bg-background text-foreground"
        }
      >
        {showNav && <NavBar />}
        <main className={showNav ? "pt-5 pb-28" : ""}>{children}</main>
      </div>
    </PromoInfoModalProvider>
  );
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WorkingHoursGate>
      <UserProvider>
      <WebSocketProvider>
        <GameProvider>
          <GroupGameProvider>
            <Sentry.ErrorBoundary
              fallback={({ error, resetError }) => (
                <div className="flex flex-col items-center justify-center h-screen text-center p-6 bg-background text-foreground">
                  <h1 className="text-3xl font-bold mb-4 text-error">Something went wrong</h1>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md">
                    {error instanceof Error ? error.message : "Unknown error"}
                  </p>
                  <button
                    onClick={resetError}
                    className="px-6 py-2 bg-primary hover:opacity-90 text-black rounded-lg transition-all"
                  >
                    Reload Page
                  </button>
                </div>
              )}
            >
              <LayoutLoader>
                <Toaster
                  position="top-center"
                  toastOptions={{
                    className: "!bg-[var(--surface)] !text-[var(--foreground)] !border !border-[var(--border)]",
                    duration: 1000,
                  }}
                />
                <Component {...pageProps} />
              </LayoutLoader>
            </Sentry.ErrorBoundary>
          </GroupGameProvider>
        </GameProvider>
      </WebSocketProvider>
      </UserProvider>
    </WorkingHoursGate>
  );
}
