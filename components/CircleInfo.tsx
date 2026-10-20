"use client";

import { valueGroup } from "@/utils/valueGroup";

interface CircleInfoProps {
  value?: number;
}

export default function CircleInfo({ value }: CircleInfoProps) {
  const group = value !== undefined ? valueGroup(value) : "";

  const percentage =
    value !== undefined ? Math.min(Math.max((value / 100) * 100, 0), 100) : 0;

  // 🎨 Group glow border + text colors
  const borderColors: Record<string, string> = {
    B: "border-blue-500 shadow-[0_0_10px_#3b82f6,0_0_25px_#1e40af]",
    I: "border-green-500 shadow-[0_0_10px_#22c55e,0_0_25px_#14532d]",
    N: "border-purple-500 shadow-[0_0_10px_#a855f7,0_0_25px_#6b21a8]",
    G: "border-red-500 shadow-[0_0_10px_#ef4444,0_0_25px_#7f1d1d]",
    O: "border-yellow-400 shadow-[0_0_10px_#facc15,0_0_25px_#78350f]",
    Invalid: "border-gray-400 shadow-[0_0_10px_#9ca3af,0_0_25px_#4b5563]",
  };

  const textColors: Record<string, string> = {
    B: "text-blue-400",
    I: "text-green-400",
    N: "text-purple-400",
    G: "text-red-400",
    O: "text-yellow-400",
    Invalid: "text-muted-foreground",
  };

  return (
    <div
      className={`relative  mr-2 ms-2 mb-2 h-24 w-24 rounded-full flex flex-col justify-center items-center cursor-default border-[3px]
      ${borderColors[group] || "border-gray-500 shadow-[0_0_10px_#9ca3af,0_0_25px_#4b5563]"}
       transition-all duration-300 hover:scale-105`}
    >
      {/* Text */}
      <div className="z-10 text-center flex flex-col items-center justify-center">
        <h1 className={`text-2xl font-extrabold ${textColors[group] || "text-muted-foreground"}`}>
          {group}
        </h1>
        <h1 className={`text-4xl  font-bold ${textColors[group] || "text-muted-foreground"}`}>
          {value !== undefined ? value : ""}
        </h1>
      </div>
    </div>
  );
}