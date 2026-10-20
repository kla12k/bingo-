"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  PanInfo,
  useMotionValue,
} from "framer-motion";
import {
  FiChevronLeft,
  FiChevronRight,
  FiShield,
  FiX,
  FiZap,
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import {
  getWeeklyPromoContent,
  PROMO_SLIDES,
  type PromoSlideId,
} from "@/lib/promo-slides";
import { getTermsSections } from "@/lib/terms-sections";
import { WinningPatternGuide } from "@/components/promo/WinningPatternGuide";

const SWIPE_THRESHOLD = 60;

type PromoInfoModalProps = {
  open: boolean;
  onClose: () => void;
  initialSlide?: number;
};

function SlideWeekly({ onNavigate }: { onNavigate: () => void }) {
  const promo = getWeeklyPromoContent();

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative rounded-2xl overflow-hidden border border-[var(--primary-border)] shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent" />
        <div className="relative p-4 text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/25 text-[9px] font-black uppercase tracking-widest text-primary">
            <FiZap size={10} /> Live now
          </div>
          <h2 className="text-sm font-black leading-snug text-foreground">{promo.headlineAm}</h2>
          <p className="text-[11px] font-bold text-accent">{promo.headlineEn}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--primary-border)] bg-[var(--primary-muted)]/35 p-3 text-center shrink-0">
        <p className="text-xs font-bold text-foreground">{promo.subAm}</p>
        <p className="text-[11px] font-semibold text-muted mt-0.5">{promo.subEn}</p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted text-center">
          How to join
        </p>
        {promo.steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/90 p-3 flex gap-3"
          >
            <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center shrink-0 shadow-md">
              {i + 1}
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">{step.am}</p>
              <p className="text-[11px] text-muted mt-0.5">{step.en}</p>
            </div>
          </motion.div>
        ))}
        <div className="rounded-xl border border-accent/35 bg-gradient-to-r from-accent/10 to-primary/10 p-3 text-center">
          <p className="text-xs font-bold text-foreground">{promo.urgencyAm}</p>
          <p className="text-[11px] text-muted mt-1">{promo.urgencyEn}</p>
        </div>
      </div>

      <Link href={promo.registerPath} onClick={onNavigate} className="shrink-0 block">
        <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-primary text-white border-0 shadow-lg shadow-primary/30 hover:scale-[1.02] transition-transform">
          Register for Weekly Tournament
        </Button>
      </Link>
    </div>
  );
}

function SlideTerms() {
  const sections = getTermsSections();

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="text-center shrink-0">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/25 to-accent/15 text-primary mb-2 border border-[var(--primary-border)] shadow-inner">
          <FiShield size={24} />
        </div>
        <h2 className="text-lg font-black text-foreground">
          ደንቦች <span className="text-primary">እና ሁኔታዎች</span>
        </h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted mt-1">{BRAND.name}</p>
      </div>
      <div className="space-y-2">
        {sections.map((section, i) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/90 p-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[var(--primary-muted)] text-primary shrink-0">
                <section.icon size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black text-foreground mb-1">{section.title}</h3>
                <p className="text-[11px] leading-relaxed text-muted">{section.content}</p>
              </div>
            </div>
          </motion.div>
        ))}
        <p className="text-[10px] text-center text-muted pb-1">ጥያቄ አለዎት? {BRAND.supportEmail}</p>
      </div>
    </div>
  );
}

function renderSlide(id: PromoSlideId, onNavigate: () => void) {
  switch (id) {
    case "weekly":
      return <SlideWeekly onNavigate={onNavigate} />;
    case "patterns":
      return <WinningPatternGuide />;
    case "terms":
      return <SlideTerms />;
  }
}

export function PromoInfoModal({ open, onClose, initialSlide = 0 }: PromoInfoModalProps) {
  const [index, setIndex] = useState(initialSlide);
  const dragX = useMotionValue(0);

  useEffect(() => {
    if (open) setIndex(Math.min(initialSlide, PROMO_SLIDES.length - 1));
  }, [open, initialSlide]);

  const goTo = useCallback((next: number) => {
    setIndex((i) => {
      if (next < 0) return PROMO_SLIDES.length - 1;
      if (next >= PROMO_SLIDES.length) return 0;
      return next;
    });
  }, []);

  const onDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) goTo(index + 1);
    else if (info.offset.x > SWIPE_THRESHOLD) goTo(index - 1);
  };

  const slide = PROMO_SLIDES[index];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Promotions and information"
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-[var(--foreground)]/50 backdrop-blur-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Close"
          />

          <motion.div
            initial={{ y: 56, opacity: 0, scale: 0.94, rotateX: 4 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative w-full sm:max-w-md h-[min(94vh,720px)] sm:h-[min(88vh,680px)] flex flex-col rounded-t-[2.25rem] sm:rounded-[2.25rem] border border-[var(--primary-border)] bg-[var(--surface)] shadow-[0_-12px_48px_rgba(var(--primary-rgb),0.28),0_0_0_1px_rgba(var(--primary-rgb),0.08)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ perspective: 1200 }}
          >
            <div className="h-1.5 shrink-0 bg-gradient-to-r from-primary via-accent to-primary" aria-hidden />
            <div
              className="absolute -top-20 -right-16 w-40 h-40 rounded-full blur-3xl opacity-40 pointer-events-none"
              style={{ background: "rgba(var(--accent-rgb), 0.35)" }}
            />
            <div
              className="absolute -bottom-16 -left-12 w-36 h-36 rounded-full blur-3xl opacity-30 pointer-events-none"
              style={{ background: "rgba(var(--primary-rgb), 0.4)" }}
            />

            <div className="relative flex items-center justify-between px-4 pt-4 pb-1 shrink-0">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/80">
                  {BRAND.shortName} Info
                </p>
                <p className="text-sm font-black text-foreground">{slide.emoji} {slide.label}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border)] bg-[var(--surface-elevated)]/90 text-muted hover:text-foreground hover:border-primary/40 hover:rotate-90 transition-all duration-300"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="relative flex items-center justify-center gap-1.5 px-4 pb-2 shrink-0">
              {PROMO_SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${
                    i === index
                      ? "bg-primary text-white shadow-lg shadow-primary/35 scale-105"
                      : "bg-[var(--primary-muted)]/40 text-muted hover:text-foreground"
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            <div className="flex justify-center gap-1.5 pb-2 shrink-0">
              {PROMO_SLIDES.map((s, i) => (
                <button
                  key={`dot-${s.id}`}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? "w-6 bg-primary" : "w-1.5 bg-[var(--border)]"
                  }`}
                  aria-label={`Go to ${s.label}`}
                />
              ))}
            </div>

            <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
              {slide.id !== "patterns" && (
                <div className="flex items-center justify-between absolute inset-y-0 left-0 right-0 pointer-events-none z-10 px-1">
                  <button
                    type="button"
                    onClick={() => goTo(index - 1)}
                    className="pointer-events-auto w-8 h-8 rounded-full bg-[var(--surface)]/95 border border-[var(--primary-border)] flex items-center justify-center text-primary shadow-md hover:bg-primary hover:text-white transition-colors"
                    aria-label="Previous slide"
                  >
                    <FiChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(index + 1)}
                    className="pointer-events-auto w-8 h-8 rounded-full bg-[var(--surface)]/95 border border-[var(--primary-border)] flex items-center justify-center text-primary shadow-md hover:bg-primary hover:text-white transition-colors"
                    aria-label="Next slide"
                  >
                    <FiChevronRight size={18} />
                  </button>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden promo-modal-scroll px-4 pb-2 overscroll-contain">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={slide.id}
                    drag={slide.id === "patterns" ? false : "x"}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.12}
                    style={{ x: slide.id === "patterns" ? undefined : dragX }}
                    onDragEnd={slide.id === "patterns" ? undefined : onDragEnd}
                    initial={{ opacity: 0, x: slide.id === "patterns" ? 0 : 32, filter: "blur(3px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: slide.id === "patterns" ? 0 : -32, filter: "blur(3px)" }}
                    transition={{ duration: 0.24 }}
                    className="min-h-0"
                  >
                    {renderSlide(slide.id, onClose)}
                  </motion.div>
                </AnimatePresence>
              </div>

              {slide.id === "patterns" && (
                <div
                  className="pointer-events-none absolute bottom-8 left-4 right-4 h-10 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/80 to-transparent z-[5]"
                  aria-hidden
                />
              )}
            </div>

            <p className="relative text-[9px] text-center text-muted/70 py-2 shrink-0 font-bold uppercase tracking-[0.2em] border-t border-[var(--border)]/40 bg-[var(--surface)]/90">
              {slide.id === "patterns" ? "Scroll down · all 5 patterns" : "Swipe · tap tabs · explore"}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
