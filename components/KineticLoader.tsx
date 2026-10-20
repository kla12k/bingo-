"use client";

import React from "react";

export type KineticLoaderVariant = "ring" | "dots" | "orbit" | "dot-pulse";

interface KineticLoaderProps {
  variant?: KineticLoaderVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "loader-kinetic-sm",
  md: "",
  lg: "loader-kinetic-lg",
};

export function KineticLoader({
  variant = "ring",
  size = "md",
  className = "",
}: KineticLoaderProps) {
  const base = "loader-kinetic-ring";
  const sizeClass = sizeClasses[size];

  if (variant === "dots") {
    return (
      <div
        className={`loader-kinetic-dots ${sizeClass} ${className}`}
        role="status"
        aria-label="Loading"
      >
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (variant === "dot-pulse") {
    return (
      <div
        className={`loader-kinetic-dot-pulse ${sizeClass} ${className}`}
        role="status"
        aria-label="Loading"
      >
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (variant === "orbit") {
    return (
      <div
        className={`loader-kinetic-orbit ${sizeClass} ${className}`}
        role="status"
        aria-label="Loading"
      >
        <span className="loader-kinetic-orbit-track" aria-hidden />
        <span className="loader-kinetic-orbit-dot" aria-hidden />
        <span className="loader-kinetic-orbit-dot loader-kinetic-orbit-dot-2" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={`${base} ${sizeClass} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export default KineticLoader;
