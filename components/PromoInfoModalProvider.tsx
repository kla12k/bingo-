"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PromoInfoModal } from "@/components/PromoInfoModal";
import { PROMO_SESSION_KEY } from "@/lib/promo-slides";

type PromoInfoModalContextValue = {
  isOpen: boolean;
  open: (slideIndex?: number) => void;
  close: () => void;
  hasSeenThisSession: boolean;
};

const PromoInfoModalContext = createContext<PromoInfoModalContextValue | null>(null);

export function PromoInfoModalProvider({
  children,
  autoShow = false,
  enabled = false,
}: {
  children: React.ReactNode;
  autoShow?: boolean;
  enabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialSlide, setInitialSlide] = useState(0);
  const [hasSeenThisSession, setHasSeenThisSession] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasSeenThisSession(sessionStorage.getItem(PROMO_SESSION_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!enabled) setIsOpen(false);
  }, [enabled]);

  const markSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(PROMO_SESSION_KEY, "1");
    setHasSeenThisSession(true);
  }, []);

  const open = useCallback(
    (slideIndex = 0) => {
      if (!enabled) return;
      setInitialSlide(slideIndex);
      setIsOpen(true);
    },
    [enabled]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    markSeen();
  }, [markSeen]);

  useEffect(() => {
    if (!enabled || !autoShow || hasSeenThisSession) return;
    const timer = window.setTimeout(() => open(0), 800);
    return () => window.clearTimeout(timer);
  }, [enabled, autoShow, hasSeenThisSession, open]);

  const value = useMemo(
    () => ({ isOpen, open, close, hasSeenThisSession }),
    [isOpen, open, close, hasSeenThisSession]
  );

  return (
    <PromoInfoModalContext.Provider value={value}>
      {children}
      {enabled && (
        <PromoInfoModal open={isOpen} onClose={close} initialSlide={initialSlide} />
      )}
    </PromoInfoModalContext.Provider>
  );
}

export function usePromoInfoModal() {
  const ctx = useContext(PromoInfoModalContext);
  if (!ctx) {
    throw new Error("usePromoInfoModal must be used within PromoInfoModalProvider");
  }
  return ctx;
}
