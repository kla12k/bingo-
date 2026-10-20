import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FiClock, FiSunrise } from "react-icons/fi";

export type WorkingHoursPayload = {
  isOpen: boolean;
  isActive: boolean;
  startTime: string;
  endTime: string;
  startTimeLabel: string;
  endTimeLabel: string;
  nextOpenAt: string;
  currentEthiopianTime: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getCountdownParts(targetIso: string, nowMs: number) {
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, done: diff <= 0 };
}

type Props = {
  data: WorkingHoursPayload;
  onOpen?: () => void;
};

export default function WorkingHoursClosed({ data, onOpen }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(
    () => getCountdownParts(data.nextOpenAt, now),
    [data.nextOpenAt, now]
  );

  useEffect(() => {
    if (countdown.done && onOpen) onOpen();
  }, [countdown.done, onOpen]);

  const segments = [
    { label: "ሰዓት", value: pad(countdown.hours) },
    { label: "ደቂቃ", value: pad(countdown.minutes) },
    { label: "ሰከንድ", value: pad(countdown.seconds) },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background text-foreground">
      <motion.div
        className="absolute top-1/4 -left-20 w-[55vmax] h-[55vmax] bg-primary/15 blur-[120px] rounded-full pointer-events-none"
        animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 -right-20 w-[45vmax] h-[45vmax] bg-primary/10 blur-[100px] rounded-full pointer-events-none"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute inset-0 pointer-events-none opacity-20">
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,520px)] aspect-square rounded-full border-2 border-primary/25"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(105vw,640px)] aspect-square rounded-full border border-primary/10"
          animate={{ rotate: -360 }}
          transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-[92%] max-w-lg p-8 sm:p-10 rounded-[2rem] border border-primary/25 bg-surface/95 backdrop-blur-2xl shadow-2xl text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="mx-auto mb-6 inline-flex items-center justify-center p-5 rounded-2xl bg-primary/10 border border-primary/20"
        >
          <FiSunrise className="text-5xl text-primary drop-shadow-[0_0_12px_rgba(54,251,158,0.35)]" />
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-primary mb-2">
          ኢንስታንት ቢንጎ ገና አልተከፈተም
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base mb-6 leading-relaxed">
         በታች ካለው የስራ ሰዓት ውስጥ ይጀምራል። እባክዎ እስከ መክፈቻ ሰዓት ድረስ ይጠብቁ።
        </p>



    
        <div className="grid grid-cols-3 gap-3">
          {segments.map((seg, i) => (
            <motion.div
              key={seg.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              className="rounded-xl border border-primary/20 bg-background/60 py-4"
            >
              <div className="text-3xl sm:text-4xl font-black tabular-nums text-primary">
                {seg.value}
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground mt-1">{seg.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
