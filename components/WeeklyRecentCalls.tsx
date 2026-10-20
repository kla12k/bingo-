"use client";

import { getBingoLetter } from "@/lib/bingo";

const BALL_STYLE: Record<string, string> = {
  B: "from-blue-500 to-blue-700 text-white",
  I: "from-green-500 to-green-700 text-white",
  N: "from-purple-500 to-purple-700 text-white",
  G: "from-red-500 to-red-700 text-white",
  O: "from-primary to-primary-hover text-black",
};

export default function WeeklyRecentCalls({ recent }: { recent: number[] }) {
  const lastFour = recent.slice(-4).reverse();

  if (lastFour.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      <span className="text-[9px] font-bold uppercase text-muted-foreground">Recent</span>
      {lastFour.map((num, i) => {
        const letter = getBingoLetter(num);
        const grad = BALL_STYLE[letter] ?? "from-gray-500 to-gray-700 text-white";
        const isLatest = i === 0;
        return (
          <div
            key={`${num}-${i}`}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-br ${grad} font-black text-[10px] sm:text-xs
              ${isLatest ? "ring-1 ring-white/40" : "opacity-75"}`}
          >
            <span className="text-[8px] opacity-90">{letter}</span>
            <span className="tabular-nums">{num}</span>
          </div>
        );
      })}
    </div>
  );
}
