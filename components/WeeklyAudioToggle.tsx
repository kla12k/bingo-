"use client";

import React from "react";
import { FiVolume2, FiVolumeX } from "react-icons/fi";

export function useWeeklyAudioPref() {
  const [muted, setMuted] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem("BINGO_AUDIO_PREF");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.muted === "boolean") setMuted(parsed.muted);
      } catch {
        /* ignore */
      }
    }
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (loaded) {
      localStorage.setItem("BINGO_AUDIO_PREF", JSON.stringify({ muted, language: "en" }));
    }
  }, [muted, loaded]);

  const cycle = () => setMuted((v) => !v);

  return { muted, language: "en" as const, loaded, cycle };
}

export default function WeeklyAudioToggle({
  muted,
  onCycle,
}: {
  muted: boolean;
  language?: "en" | "am";
  onCycle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold border transition-all active:scale-95
        ${muted
          ? "border-error/40 bg-error/15 text-error"
          : "border-primary-border bg-primary-muted text-primary"
        }`}
      aria-label="Toggle sound"
    >
      {muted ? <FiVolumeX className="w-3.5 h-3.5" /> : <FiVolume2 className="w-3.5 h-3.5" />}
      {muted ? "Off" : "EN"}
    </button>
  );
}
