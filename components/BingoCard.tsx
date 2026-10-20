"use client";

import { motion } from "framer-motion";
import { AiFillStar } from "react-icons/ai";
import { Button } from "./ui/button";
import { useUser } from "@/api/session";
interface BingoCardPropType {
  numbers: number[][];
  selectedNumbers: number[];
  onNumberClick: (num: number) => void;
}

export default function BingoCard({ numbers = [], selectedNumbers, onNumberClick }: BingoCardPropType) {
  const isValidNumbers = Array.isArray(numbers) && numbers.every(Array.isArray);
  const bingoArray = "BINGO".split("");
  const { displayReference } = useUser();
  const handleNumberClick = (num: number) => {
    if (num !== 0) onNumberClick(num);
  };

  const flatNumbers = numbers.flat();

  const patterns: number[][] = [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    [0, 4, 20, 24],
    [6, 8, 16, 18],
  ];

  const matchedIndexes = new Set<number>();
  patterns.forEach((pattern) => {
    const vals = pattern.map((i) => flatNumbers[i]);
    if (vals.every((v) => v === 0 || selectedNumbers.includes(v))) {
      pattern.forEach((i) => matchedIndexes.add(i));
    }
  });

  const bingoColors = [
    { bg: "from-blue-500 to-blue-800", glow: "shadow-[0_0_12px_#3b82f6]" },
    { bg: "from-green-500 to-green-800", glow: "shadow-[0_0_12px_#22c55e]" },
    { bg: "from-purple-500 to-purple-800", glow: "shadow-[0_0_12px_#a855f7]" },
    { bg: "from-red-500 to-red-800", glow: "shadow-[0_0_12px_#ef4444]" },
    { bg: "from-yellow-300 to-yellow-600", glow: "shadow-[0_0_12px_#facc15]" },
  ];

  return (
    <div className="relative mx-auto w-40 rounded-2xl p-2 bg-surface border border-border shadow-[0_4px_14px_rgba(30,36,51,0.08)]">
      <div className="absolute -top-[2px] left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent blur-sm opacity-60" />

      {/* BINGO Header */}
      <div className="grid grid-cols-5 gap-[2px] mb-[3px]">
        {bingoArray.map((letter, index) => (
          <motion.div
            key={letter}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.1, type: "spring", stiffness: 120 }}
          >
            <div
              className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold select-none
             text-white
              bg-gradient-to-br ${bingoColors[index].bg} ${bingoColors[index].glow}
              border border-white/20`}
            >
              {letter}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Grid Numbers */}
      <div className="grid grid-cols-5 gap-[3px]">
        {isValidNumbers ? (
          flatNumbers.map((num, index) => {
            const isSelected = selectedNumbers.includes(num);
            const isMatched = matchedIndexes.has(index);

            let bg = "bg-surface border border-border";
            let glow = "";
            let text = "text-foreground";

            if (isMatched) {
              bg = "bg-error border-error";
              glow = "shadow-[0_0_8px_rgba(185,28,28,0.35)]";
              text = "text-white";
            } else if (isSelected) {
              bg = "bg-primary";
              glow = "shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]";
              text = "text-foreground";
            } else if (num === 0) {
              bg = "bg-[var(--stake-green)]";
              glow = "shadow-[0_0_8px_rgba(45,138,62,0.35)]";
              text = "text-white";
            }

            return (
              <motion.div
                key={index}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.3 + index * 0.01,
                  type: "spring",
                  stiffness: 100,
                }}
              >
                <button
                  onClick={() => handleNumberClick(num)}
                  className={`w-7 h-7 flex items-center justify-center text-[14px] font-bold rounded-md ${bg} ${glow} ${text} hover:scale-110 transition-all duration-200`}
                >
                  {num === 0 ? <AiFillStar size={12} /> : num}
                </button>
              </motion.div>
            );
          })
        ) : (
          <div className="col-span-5 text-center text-red-400 text-xs font-semibold py-2">
            Invalid Bingo Data
          </div>
        )}
      </div>

      {/* Subtle background halo */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/10 via-pink-400/10 to-yellow-300/10 blur-xl -z-10" />
    </div>
  );
}