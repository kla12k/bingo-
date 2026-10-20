"use client";

import { motion } from "framer-motion";
import { getBingoLetter } from "@/lib/bingo";

const COLUMNS = [
  { letter: "B", from: "var(--bingo-b)", to: "#1d4ed8", glow: "rgba(59,130,246,0.35)" },
  { letter: "I", from: "var(--bingo-i)", to: "#047857", glow: "rgba(16,185,129,0.35)" },
  { letter: "N", from: "var(--bingo-n)", to: "#be185d", glow: "rgba(236,72,153,0.35)" },
  { letter: "G", from: "var(--bingo-g)", to: "#b45309", glow: "rgba(245,158,11,0.35)" },
  { letter: "O", from: "var(--bingo-o)", to: "#7e22ce", glow: "rgba(168,85,247,0.35)", textDark: false },
];

function columnNumbers(colIndex: number) {
  return Array.from({ length: 15 }, (_, row) => row + 1 + colIndex * 15);
}

export default function WeeklyCalledBoard({
  calledNumbers,
  currentCall,
}: {
  calledNumbers: number[];
  currentCall: number | null;
}) {
  const calledSet = new Set(calledNumbers);

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden shadow-[0_4px_14px_rgba(30,36,51,0.06)]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-surface-elevated">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
          Master board
        </p>
        <p className="text-[9px] font-bold text-muted tabular-nums">
          {calledNumbers.length}/75
        </p>
      </div>

      <div className="p-1.5 space-y-1">
        {COLUMNS.map((col, colIndex) => {
          const nums = columnNumbers(colIndex);
          const calledInCol = nums.filter((n) => calledSet.has(n)).length;

          return (
            <div
              key={col.letter}
              className="flex items-stretch gap-1 rounded-lg bg-surface-elevated border border-border p-0.5"
            >
              <div
                className="w-7 shrink-0 rounded-md flex flex-col items-center justify-center py-1"
                style={{
                  background: `linear-gradient(180deg, ${col.from}, ${col.to})`,
                  boxShadow: `0 0 8px ${col.glow}`,
                }}
              >
                <span
                  className={`text-xs font-black leading-none ${col.textDark ? "text-black" : "text-white"}`}
                >
                  {col.letter}
                </span>
                <span
                  className={`text-[7px] font-bold mt-0.5 ${col.textDark ? "text-black/70" : "text-white/70"}`}
                >
                  {calledInCol}
                </span>
              </div>

              <div className="flex-1 flex flex-wrap gap-0.5 content-start min-w-0">
                {nums.map((num) => {
                  const isCalled = calledSet.has(num);
                  const isCurrent = num === currentCall;

                  return (
                    <motion.div
                      key={num}
                      layout
                      animate={isCurrent ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className={`w-[calc(20%-2px)] min-w-[1.35rem] h-5 flex items-center justify-center rounded-full text-[8px] font-bold tabular-nums border transition-colors
                        ${isCurrent
                          ? "bg-accent text-black border-accent ring-2 ring-accent/50 shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] z-10"
                          : isCalled
                            ? "text-white border-transparent"
                            : "bg-[var(--hover-overlay)] text-muted border-border"
                        }`}
                      style={
                        isCalled && !isCurrent
                          ? {
                              background: `linear-gradient(135deg, ${col.from}, ${col.to})`,
                              boxShadow: `0 0 4px ${col.glow}`,
                            }
                          : undefined
                      }
                    >
                      {num}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
