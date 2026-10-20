"use client";

import { motion } from "framer-motion";
import { AiFillStar } from "react-icons/ai";

const BINGO_COLORS = [
  { bg: "from-[var(--bingo-b)] to-blue-800", glow: "shadow-[0_0_6px_rgba(59,130,246,0.4)]" },
  { bg: "from-[var(--bingo-i)] to-green-800", glow: "shadow-[0_0_6px_rgba(16,185,129,0.4)]" },
  { bg: "from-[var(--bingo-n)] to-pink-800", glow: "shadow-[0_0_6px_rgba(236,72,153,0.4)]" },
  { bg: "from-[var(--bingo-g)] to-amber-800", glow: "shadow-[0_0_6px_rgba(245,158,11,0.4)]" },
  { bg: "from-[var(--bingo-o)] to-purple-800", glow: "shadow-[0_0_6px_rgba(168,85,247,0.4)]" },
];

const CELL = "w-8 h-8";

export default function WeeklyPlayCard({
  cardId,
  numbers,
  calledNumbers,
  lastCalled,
}: {
  cardId: number;
  numbers: number[][];
  calledNumbers: number[];
  lastCalled?: number | null;
}) {
  const flat = numbers.flat();
  const calledSet = new Set([0, ...calledNumbers]);
  const markedCount = flat.filter((n) => calledSet.has(n) || n === 0).length;
  const bingoLetters = "BINGO".split("");

  return (
    <div className="relative w-fit max-w-full mx-auto">
      <div className="absolute -inset-0.5 rounded-xl bg-primary-muted blur-sm pointer-events-none" />
      <div className="relative rounded-xl overflow-hidden border-2 border-primary-border shadow-[0_4px_14px_rgba(var(--primary-rgb),0.12)]">
        <div className="bg-gradient-to-r from-primary to-primary-hover px-2.5 py-1.5 flex items-start justify-between text-white">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-white/75 leading-none">
              Your ticket
            </p>
            <p className="text-sm font-black tabular-nums leading-tight mt-0.5">#{cardId}</p>
          </div>
          <div className="text-right">
            <p className="text-[7px] font-bold uppercase text-white/75 leading-none">Marked</p>
            <p className="text-xs font-black tabular-nums leading-tight mt-0.5">
              {markedCount}/25
            </p>
          </div>
        </div>

        <div className="h-0.5 bg-primary-border">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${(markedCount / 25) * 100}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
          />
        </div>

        <div className="p-1.5 bg-surface">
          <div className="grid grid-cols-5 gap-0.5 mb-0.5">
            {bingoLetters.map((letter, i) => (
              <div
                key={letter}
                className={`${CELL} h-5 flex items-center justify-center rounded-md text-[9px] font-black text-white
                  bg-gradient-to-br ${BINGO_COLORS[i].bg} ${BINGO_COLORS[i].glow} border border-white/20`}
              >
                {letter}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-0.5">
            {flat.map((num, index) => {
              const marked = calledSet.has(num) || num === 0;
              const isLatest = lastCalled != null && num === lastCalled;
              const isFree = num === 0;

              let cellClass =
                "border-border bg-surface-elevated text-foreground";
              if (marked) {
                cellClass = isLatest
                  ? "bg-accent text-black border-2 border-accent ring-2 ring-accent/60 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)]"
                  : "bg-primary text-white border-2 border-primary-hover shadow-[0_0_4px_rgba(var(--primary-rgb),0.35)]";
              }

              return (
                <motion.div
                  key={index}
                  initial={isLatest ? { scale: 0.85 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className={`relative ${CELL} flex items-center justify-center rounded-md text-[10px] font-black border ${cellClass}`}
                >
                  {isFree ? (
                    <AiFillStar
                      className={`w-2.5 h-2.5 ${marked ? (isLatest ? "text-black" : "text-white") : "text-primary"}`}
                    />
                  ) : (
                    num
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
