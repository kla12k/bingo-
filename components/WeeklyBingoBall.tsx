"use client";

import { motion, AnimatePresence } from "framer-motion";
import { getBingoLetter } from "@/lib/bingo";

const BALL_COLORS: Record<string, { bg: string; ring: string; text: string; glow: string }> = {
  B: {
    bg: "from-blue-400 via-blue-600 to-blue-800",
    ring: "ring-blue-300/70",
    text: "text-white",
    glow: "shadow-[0_0_24px_rgba(59,130,246,0.45)]",
  },
  I: {
    bg: "from-green-400 via-green-600 to-green-800",
    ring: "ring-green-300/70",
    text: "text-white",
    glow: "shadow-[0_0_24px_rgba(34,197,94,0.45)]",
  },
  N: {
    bg: "from-purple-400 via-purple-600 to-purple-800",
    ring: "ring-purple-300/70",
    text: "text-white",
    glow: "shadow-[0_0_24px_rgba(168,85,247,0.45)]",
  },
  G: {
    bg: "from-red-400 via-red-600 to-red-800",
    ring: "ring-red-300/70",
    text: "text-white",
    glow: "shadow-[0_0_24px_rgba(239,68,68,0.45)]",
  },
  O: {
    bg: "from-primary via-pink-500 to-primary-hover",
    ring: "ring-pink-200/80",
    text: "text-black",
    glow: "shadow-[0_0_24px_rgba(251,191,36,0.45)]",
  },
};

export default function WeeklyBingoBall({
  number,
  callIndex,
}: {
  number: number | null;
  callIndex: number;
}) {
  const letter = number != null ? getBingoLetter(number) : null;
  const colors = letter ? BALL_COLORS[letter] : null;

  return (
    <div className="relative mx-auto w-full max-w-xs py-0">
      <div className="relative mx-auto w-20 h-2 rounded-full bg-gradient-to-b from-zinc-500 to-zinc-800 border border-white/15 shadow-inner mb-0.5" />

      <AnimatePresence mode="wait">
        {number != null && colors ? (
          <motion.div
            key={`${number}-${callIndex}`}
            initial={{ y: -60, opacity: 0, scale: 0.4, rotate: -120 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="flex flex-col items-center"
          >
            <div
              className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br ${colors.bg} ${colors.ring} ring-[3px]
                ${colors.glow}
                shadow-[inset_0_-4px_12px_rgba(0,0,0,0.35),inset_0_4px_8px_rgba(255,255,255,0.25)]
                flex items-center justify-center`}
            >
              <div className="absolute top-2.5 left-5 w-8 h-4 rounded-full bg-white/30 blur-sm rotate-[-30deg]" />
              <div className={`text-center ${colors.text}`}>
                <p className="text-xs font-black tracking-[0.2em] opacity-90">{letter}</p>
                <p className="text-3xl sm:text-4xl font-black leading-none tabular-nums">{number}</p>
              </div>
            </div>
            <p className="mt-1 text-xs font-black uppercase tracking-widest text-muted">
              {letter} — {number}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-3"
          >
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-primary-border bg-surface-elevated flex items-center justify-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase text-center px-2">
                Waiting…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
