"use client";

import { cn } from "@/lib/utils";

type AnimateProps = {
  children: React.ReactNode;
  delay?: number;
  yOffset?: number;
  duration?: number;
  className?: string;
};

export function Animate({
  children,
  delay = 0,
  yOffset = 8,
  duration = 0.4,
  className,
}: AnimateProps) {
  return (
    <div
      className={cn("animate-entrance", className)}
      style={{
        "--entrance-delay": `${delay}s`,
        "--entrance-y": `${yOffset}px`,
        "--entrance-duration": `${duration}s`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
