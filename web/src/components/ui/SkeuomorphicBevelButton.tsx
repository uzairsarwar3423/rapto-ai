import React from "react";
import { Plus } from "lucide-react";

export interface SkeuomorphicButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  icon?: React.ReactNode;
}

export const SkeuomorphicBevelButton: React.FC<SkeuomorphicButtonProps> = ({
  children = "Add Meeting",
  icon = <Plus className="w-5 h-5" />,
  className = "",
  ...props
}) => {
  return (
    <button
      {...props}
      className={`
        relative inline-flex items-center justify-center gap-2.5 px-6 py-3
        font-sans text-[15px] font-bold text-white whitespace-nowrap select-none
        rounded-xl cursor-pointer transition-all duration-150 ease-out

        /* Vibrant Fresh Green Gradient (Light Specular Top to Clean Emerald Base - NOT dark green) */
        bg-gradient-to-b from-emerald-400 via-emerald-600 to-emerald-800

        /* 3D Skeuomorphic Bezel Borders (Top Light Highlight + Deep Clean Bottom) */
        border border-emerald-800 border-t-emerald-200

        /* Dual Inset Specular Reflection + Outer Soft Elevation Shadow */
        shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-2px_4px_rgba(0,0,0,0.3),0_4px_14px_rgba(16,185,129,0.35)]

        /* Hover Effect: Brightened Specular Reflection & Elevated Glow */
        hover:from-emerald-300 hover:via-emerald-500 hover:to-emerald-700
        hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_20px_rgba(16,185,129,0.5)]
        hover:-translate-y-0.5

        /* Active / Pressed Depressed Tactile Feedback */
        active:from-emerald-600 active:to-emerald-800
        active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)]
        active:translate-y-0.5

        /* Focus & Disabled States */
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        disabled:opacity-50 disabled:pointer-events-none disabled:grayscale

        ${className}
      `.trim().replace(/\s+/g, " ")}
    >
      {/* Top Gloss Specular Curve Overlay */}
      <span className="absolute inset-x-0 top-0 h-[45%] rounded-t-[11px] bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />

      {/* Crisp Skeuomorphic Text Shadow & Icon */}
      <span className="relative z-10 flex items-center gap-2.5 [text-shadow:0_-1px_1px_rgba(4,120,87,0.9)]">
        {icon}
        <span>{children}</span>
      </span>
    </button>
  );
};

export default SkeuomorphicBevelButton;
