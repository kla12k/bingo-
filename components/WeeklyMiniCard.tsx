"use client";

import React from "react";
import { AiFillStar } from "react-icons/ai";

const BINGO_COLORS = [
  "from-[var(--bingo-b)] to-blue-800",
  "from-[var(--bingo-i)] to-green-800",
  "from-[var(--bingo-n)] to-pink-800",
  "from-[var(--bingo-g)] to-amber-800",
  "from-[var(--bingo-o)] to-purple-800",
];

const SIZE_MAP = {
  xs: { cell: "w-5 h-5 text-[8px]", header: "h-4 text-[7px]", gap: "gap-0.5", showHeader: false, star: "w-2 h-2" },
  sm: { cell: "w-6 h-6 text-[10px]", header: "h-5 text-[9px]", gap: "gap-0.5", showHeader: true, star: "w-2.5 h-2.5" },
  md: { cell: "w-7 h-7 text-xs", header: "h-6 text-[10px]", gap: "gap-1", showHeader: true, star: "w-3 h-3" },
};

function cellStyle(isWin: boolean, isMarked: boolean): string {
  if (isWin) {
    return "bg-accent text-black ring-2 ring-accent/70 shadow-[0_0_6px_rgba(var(--accent-rgb),0.5)] font-black";
  }
  if (isMarked) {
    return "bg-primary text-white border-2 border-primary-hover shadow-[0_0_4px_rgba(var(--primary-rgb),0.35)] font-bold";
  }
  return "bg-surface-elevated text-foreground border border-border font-semibold";
}

export default function WeeklyMiniCard({
  grid,
  highlightPositions = [],
  calledNumbers = [],
  size = "sm",
}: {
  grid: number[][];
  highlightPositions?: number[];
  calledNumbers?: number[];
  size?: "xs" | "sm" | "md";
}) {
  const flat = grid.flat();
  const calledSet = new Set([0, ...calledNumbers]);
  const cfg = SIZE_MAP[size];
  const bingoLetters = "BINGO".split("");

  return (
    <div className={`flex flex-col ${cfg.gap} rounded-lg bg-surface p-1.5 border border-border`}>
      {cfg.showHeader && (
        <div className={`grid grid-cols-5 ${cfg.gap}`}>
          {bingoLetters.map((letter, i) => (
            <div
              key={letter}
              className={`${cfg.header} flex items-center justify-center rounded font-black text-white bg-gradient-to-br ${BINGO_COLORS[i]}`}
            >
              {letter}
            </div>
          ))}
        </div>
      )}
      <div className={`grid grid-cols-5 ${cfg.gap}`}>
        {flat.map((n, i) => {
          const pos = i + 1;
          const isWin = highlightPositions.includes(pos);
          const isFree = n === 0;
          const isMarked = calledSet.has(n) || isFree;
          return (
            <div
              key={i}
              className={`${cfg.cell} flex items-center justify-center rounded ${cellStyle(isWin, isMarked)}`}
            >
              {isFree ? (
                <AiFillStar className={`${cfg.star} ${isWin ? "text-black" : "text-white"}`} />
              ) : (
                n
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
