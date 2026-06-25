"use client";

import React, { useState, useEffect } from "react";
import {
  clampScore,
  scoreToStrokeDashoffset,
  scoreToArcColor,
  getGaugeDimensions,
} from "./CommitmentScore.utils";

export interface CommitmentScoreProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animateFrom?: number;
}

export function CommitmentScore({
  score,
  size = "md",
  showLabel = true,
  animateFrom,
}: CommitmentScoreProps) {
  const { diameter, strokeWidth, fontSize } = getGaugeDimensions(size);
  const clampedTargetScore = clampScore(score);
  
  // Radius fixed at 45 in the 0-100 viewBox coordinate system
  const radius = 45;
  const circumference = 2 * Math.PI * radius; // ~282.74

  // State to drive the SVG stroke animation.
  // If animateFrom is provided, start there. Otherwise, render already settled.
  const [animatedScore, setAnimatedScore] = useState(() => {
    return animateFrom !== undefined ? clampScore(animateFrom) : clampedTargetScore;
  });

  useEffect(() => {
    if (animateFrom !== undefined) {
      // Trigger transition to target score on mount/update
      const timer = setTimeout(() => {
        setAnimatedScore(clampedTargetScore);
      }, 50); // Small delay to guarantee browser paints initial state first
      return () => clearTimeout(timer);
    } else {
      // Ensure we keep sync if target score changes without animateFrom
      setAnimatedScore(clampedTargetScore);
    }
  }, [clampedTargetScore, animateFrom]);

  const dashOffset = scoreToStrokeDashoffset(animatedScore, circumference);
  const arcColor = scoreToArcColor(clampedTargetScore);

  // Hide labels for sm preset unless explicitly overridden
  const isLabelVisible = size === "sm" ? showLabel === true : showLabel;

  return (
    <div
      className="relative inline-flex items-center justify-center font-mono select-none"
      style={{ width: diameter, height: diameter }}
    >
      {/* Screen reader readable text fallback */}
      <span className="sr-only">
        {`Commitment score: ${clampedTargetScore} out of 100`}
      </span>

      {/* Main SVG Gauge */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="w-full h-full -rotate-90"
      >
        {/* Background Track Circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Foreground Progress Arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={arcColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
        />
      </svg>

      {/* Central Numeric Score (always displays final target score immediately) */}
      {isLabelVisible && (
        <span
          className="absolute font-semibold text-foreground flex items-center justify-center"
          style={{ fontSize }}
        >
          {clampedTargetScore}
        </span>
      )}
    </div>
  );
}
