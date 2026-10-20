"use client";

import { valueGroup } from "@/utils/valueGroup";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button } from "./ui/button";
import CircleInfo from "./CircleInfo";
import { useUser } from "@/api/session";
interface NumberListProps {
  numbers: number[][]; // 2D array of numbers (e.g., Bingo cards)
  recent: number[]; // Array of recent numbers called
  picked: number[]; // Array of picked numbers
  handleRecent: (t: number) => void; // Function to handle recent number updates
}

export default function NumberList({ numbers = [], recent, picked }: NumberListProps) {
  const { displayReference } = useUser();
  const bingo = "BINGO";
  const bingoArray = bingo.split("");
  const [clickedNum] = useState<number | null>(null);
  //console.log("Recent Numbers:", recent);
  const current = recent[recent.length - 1];
  const currentLetter = current ? valueGroup(current) : "";
  // Special recent number styles
  const recentStyles: string[] = [
    "bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-500 text-white rounded-full shadow-lg",
    "bg-gradient-to-tr from-green-400 via-yellow-300 to-orange-400 text-white rounded-2xl shadow-md",
    "bg-gradient-to-br from-red-500 via-pink-400 to-yellow-300 text-white rounded-xl shadow-lg",
    "bg-gradient-to-l from-indigo-400 via-purple-400 to-pink-400 text-white rounded-full shadow-xl",
  ];
  const bingoColors = [
    { bg: "from-blue-500 to-blue-800", glow: "shadow-[0_0_12px_#3b82f6]" },
    { bg: "from-green-500 to-green-800", glow: "shadow-[0_0_12px_#22c55e]" },
    { bg: "from-purple-500 to-purple-800", glow: "shadow-[0_0_12px_#a855f7]" },
    { bg: "from-red-500 to-red-800", glow: "shadow-[0_0_12px_#ef4444]" },
    { bg: "from-yellow-300 to-yellow-600", glow: "shadow-[0_0_12px_#facc15]" },
  ];
  const bingoColors2: Record<string, string> = {
    B: "bg-gradient-to-br from-blue-500 to-blue-800 text-white",
    I: "bg-gradient-to-br from-green-500 to-green-800 text-white",
    N: "bg-gradient-to-br from-purple-500 to-purple-800 text-white",
    G: "bg-gradient-to-br from-red-500 to-red-800 text-white",
    O: "bg-gradient-to-br from-yellow-400 to-yellow-800 text-black",
  };
  return (
    <div className=" w-full flex flex-col items-center">
      <div className="">
        <div className="grid grid-cols-4 gap-1 p-2">
          <AnimatePresence>
            {recent.map((t, i) => {
              const groupLetter = valueGroup(t);
              const colorClass = bingoColors2[groupLetter] || "bg-gray-400 text-white";

              return (
                <Button
                  key={i}
                  className={`w-full h-6 ${colorClass} text-[12px] font-bold shadow rounded-md`}
                >
                  {groupLetter} {t}
                </Button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <CircleInfo value={recent[recent.length - 1]} />

      {/* BINGO Letters */}
      <div className="bg-transparent rounded-lg shadow-lg p-2 mb-2">
        <div className="grid grid-cols-5 gap-3 mb-[1px]">
          {bingoArray.map((letter, index) => (
            <motion.div
              key={letter}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 120 }}
            >
              <div
                className={`w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold text-white select-none
              bg-gradient-to-br ${bingoColors[index].bg} ${bingoColors[index].glow}
              border border-white/20`}
              >
                {letter}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid mt-1 grid-cols-5 gap-2">
          {numbers.flat().map((num, index) => {
            const isPicked = picked.includes(num);
            const isCurrent = num === current;

            return (
              <motion.div
                key={num}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05 + index * 0.015 }}
                className={`flex items-center justify-center w-6 h-5 text-xs font-bold rounded-full border
              ${isCurrent
                    ? "bg-primary text-foreground shadow-[0_0_8px_rgba(var(--primary-rgb),0.45)] border-[var(--primary-border)]"
                    : isPicked
                      ? "bg-[var(--stake-green)] text-white shadow-[0_0_8px_rgba(45,138,62,0.35)] border-[var(--stake-green)]"
                      : "bg-surface text-foreground border-border hover:border-primary/40"
                  }`}
              >
                {num}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}