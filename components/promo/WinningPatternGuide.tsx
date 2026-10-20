"use client";

import React from "react";
import { motion } from "framer-motion";
import { FiChevronDown, FiStar } from "react-icons/fi";

type CellKind = "win" | "called" | "idle" | "free";

type PatternDef = {
  id: string;
  title: string;
  accent: string;
  grid: CellKind[][];
  sampleNumbers: (number | null)[][];
  note?: string;
};

const BINGO_HEADERS = ["B", "I", "N", "G", "O"];

const PATTERNS: PatternDef[] = [
  {
    id: "diagonal",
    title: "Diagonal",
    accent: "#2563eb",
    grid: [
      ["win", "idle", "idle", "idle", "idle"],
      ["idle", "win", "idle", "idle", "idle"],
      ["idle", "idle", "free", "idle", "idle"],
      ["idle", "idle", "idle", "win", "idle"],
      ["idle", "idle", "idle", "idle", "win"],
    ],
    sampleNumbers: [
      [13, 24, 31, 48, 62],
      [2, 18, 33, 51, 71],
      [9, 22, null, 55, 68],
      [14, 27, 38, 44, 75],
      [5, 19, 42, 58, 61],
    ],
  },
  {
    id: "square",
    title: "Square Frame",
    accent: "#7c3aed",
    grid: [
      ["idle", "idle", "idle", "idle", "idle"],
      ["idle", "win", "idle", "win", "idle"],
      ["idle", "idle", "free", "idle", "idle"],
      ["idle", "win", "idle", "win", "idle"],
      ["idle", "idle", "idle", "idle", "idle"],
    ],
    sampleNumbers: [
      [11, 20, 35, 47, 60],
      [3, 16, 28, 52, 70],
      [8, 25, null, 41, 66],
      [6, 17, 39, 54, 72],
      [12, 23, 44, 57, 63],
    ],
  },
  {
    id: "vertical",
    title: "Vertical Line",
    accent: "#ea580c",
    grid: [
      ["idle", "idle", "win", "idle", "idle"],
      ["idle", "idle", "win", "idle", "idle"],
      ["idle", "idle", "free", "idle", "idle"],
      ["idle", "idle", "win", "idle", "idle"],
      ["idle", "idle", "win", "idle", "idle"],
    ],
    sampleNumbers: [
      [10, 21, 32, 46, 64],
      [4, 15, 29, 53, 69],
      [7, 26, null, 43, 67],
      [1, 18, 36, 50, 74],
      [15, 24, 40, 56, 62],
    ],
  },
  {
    id: "horizontal",
    title: "Horizontal Line",
    accent: "#0891b2",
    grid: [
      ["idle", "idle", "idle", "idle", "idle"],
      ["win", "win", "win", "win", "win"],
      ["idle", "idle", "free", "idle", "idle"],
      ["idle", "idle", "idle", "idle", "idle"],
      ["idle", "idle", "idle", "idle", "idle"],
    ],
    sampleNumbers: [
      [12, 19, 34, 49, 65],
      [2, 18, 33, 51, 71],
      [9, 22, null, 55, 68],
      [14, 27, 38, 44, 75],
      [5, 19, 42, 58, 61],
    ],
  },
  {
    id: "corners",
    title: "Four Corners",
    accent: "#059669",
    grid: [
      ["win", "idle", "idle", "idle", "win"],
      ["idle", "idle", "idle", "idle", "idle"],
      ["idle", "idle", "free", "idle", "idle"],
      ["idle", "idle", "idle", "idle", "idle"],
      ["win", "idle", "idle", "idle", "win"],
    ],
    sampleNumbers: [
      [13, 24, 31, 48, 62],
      [2, 18, 33, 51, 71],
      [9, 22, null, 55, 68],
      [14, 27, 38, 44, 75],
      [5, 19, 42, 58, 61],
    ],
    note: "Winning numbers: 13, 2, 71, 62",
  },
];

function cellClass(kind: CellKind): string {
  switch (kind) {
    case "win":
      return "pattern-cell-win";
    case "called":
      return "bg-[var(--border)]/55 text-muted border-[var(--border)]";
    case "free":
      return "pattern-cell-free";
    default:
      return "bg-[var(--surface-elevated)] text-foreground/40 border-[var(--border)]/45";
  }
}

function MiniPatternCard({ pattern, index }: { pattern: PatternDef; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className="pattern-card-fancy rounded-2xl p-3 relative overflow-hidden"
      style={{ "--pattern-accent": pattern.accent } as React.CSSProperties}
    >
      <div
        className="absolute inset-x-0 top-0 h-1 opacity-90"
        style={{ background: `linear-gradient(90deg, transparent, ${pattern.accent}, transparent)` }}
      />
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-md"
            style={{ background: pattern.accent }}
          >
            {index + 1}
          </span>
          <p
            className="text-[11px] font-black uppercase tracking-widest"
            style={{ color: pattern.accent }}
          >
            {pattern.title}
          </p>
        </div>
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: pattern.accent, boxShadow: `0 0 10px ${pattern.accent}` }}
        />
      </div>

      <div className="grid grid-cols-5 gap-1 mb-1">
        {BINGO_HEADERS.map((letter) => (
          <div
            key={letter}
            className="text-[8px] font-black text-center uppercase tracking-wider opacity-50"
            style={{ color: pattern.accent }}
          >
            {letter}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1 relative">
        {pattern.grid.map((row, r) =>
          row.map((kind, c) => {
            const num = pattern.sampleNumbers[r][c];
            return (
              <motion.div
                key={`${pattern.id}-${r}-${c}`}
                initial={kind === "win" ? { scale: 0.8, opacity: 0 } : false}
                animate={kind === "win" ? { scale: 1, opacity: 1 } : undefined}
                transition={{
                  delay: 0.08 + index * 0.04 + (r + c) * 0.015,
                  type: "spring",
                  stiffness: 440,
                }}
                className={`aspect-square rounded-lg border flex items-center justify-center text-[9px] font-black ${cellClass(kind)}`}
              >
                {kind === "free" ? <FiStar size={11} className="shrink-0" /> : num}
              </motion.div>
            );
          })
        )}
      </div>

      {pattern.note && (
        <p className="text-[9px] text-muted mt-2.5 text-center font-bold px-2 py-1.5 rounded-lg bg-[var(--primary-muted)]/25">
          {pattern.note}
        </p>
      )}
    </motion.article>
  );
}

export function WinningPatternGuide() {
  return (
    <div className="space-y-3 pb-6">
      <div className="text-center px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary mb-1">
          Win Patterns
        </p>
        <h2 className="text-base font-black text-foreground leading-tight">
          Bingo Winning Patterns Guide
        </h2>
        <p className="text-[10px] text-muted mt-1">
          Match the green pattern — numbers are examples only
        </p>
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-[var(--primary-muted)]/50 border border-[var(--primary-border)] text-[9px] font-black uppercase tracking-widest text-primary"
        >
          <FiChevronDown size={12} className="animate-bounce" />
          Scroll for all {PATTERNS.length} patterns
        </motion.div>
      </div>

      {PATTERNS.map((p, i) => (
        <MiniPatternCard key={p.id} pattern={p} index={i} />
      ))}

      <div className="rounded-2xl border border-[var(--primary-border)] bg-gradient-to-br from-[var(--primary-muted)]/40 to-accent/5 p-3.5 shadow-inner">
        <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2.5 text-center">
          Legend
        </p>
        <div className="grid grid-cols-2 gap-2.5 text-[9px] font-bold">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md pattern-cell-win shrink-0 border-0" />
            <span className="text-muted">Winning pattern</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md bg-[var(--border)] shrink-0" />
            <span className="text-muted">Called (not win)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md bg-[var(--surface-elevated)] border border-[var(--border)] shrink-0" />
            <span className="text-muted">Not called</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-md pattern-cell-free shrink-0 flex items-center justify-center border-0">
              <FiStar size={8} />
            </span>
            <span className="text-muted">Free space</span>
          </div>
        </div>
        <p className="text-[9px] text-center text-muted mt-3 leading-relaxed font-semibold">
          💡 Any card arrangement matching the highlighted pattern wins!
        </p>
      </div>
    </div>
  );
}
