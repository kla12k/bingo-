"use client";

import { useEffect, useRef } from "react";

export default function ConfettiEffect({
  active = true,
  duration = 30000,
  particleCount = 250,
}: {
  active?: boolean;
  duration?: number;
  particleCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let stopped = false;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const confettiCount = Math.max(20, Math.min(250, particleCount));
    const confetti = new Array(confettiCount).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h - h,
      r: 6 + Math.random() * 8,
      d: 10 + Math.random() * 20,
      color: `hsl(${Math.random() * 360}, 100%, 50%)`,
      tilt: Math.random() * 10 - 10,
      tiltAngleIncremental: Math.random() * 0.1 + 0.04,
      tiltAngle: 0,
    }));

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    const update = () => {
      confetti.forEach((c) => {
        c.tiltAngle += c.tiltAngleIncremental;
        c.y += (Math.cos(c.d) + 3 + c.r / 2) / 2;
        c.x += Math.sin(0.1);
        c.tilt = Math.sin(c.tiltAngle) * 15;
        if (c.y > h) {
          c.y = -10;
          c.x = Math.random() * w;
        }
      });
    };

    const draw = () => {
      if (stopped) return;
      ctx.clearRect(0, 0, w, h);
      confetti.forEach((c) => {
        ctx.beginPath();
        ctx.lineWidth = c.r;
        ctx.strokeStyle = c.color;
        ctx.moveTo(c.x + c.tilt + c.r / 2, c.y);
        ctx.lineTo(c.x + c.tilt, c.y + c.tilt + c.r / 2);
        ctx.stroke();
      });
      update();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const stopTimer = setTimeout(() => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, duration);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(stopTimer);
      window.removeEventListener("resize", resize);
    };
  }, [active, duration, particleCount]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{ width: "100%", height: "100%" }}
      aria-hidden
    />
  );
}
