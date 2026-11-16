import type { CSSProperties, InputHTMLAttributes } from "react";
import { cn } from "@/lib/format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function RangeSlider({
  className,
  min = 0,
  max = 100,
  value,
  style,
  ...props
}: Props) {
  const lo = Number(min);
  const hi = Number(max);
  const current = Number(value ?? lo);
  const span = hi - lo;
  const pct = span <= 0 ? 0 : ((current - lo) / span) * 100;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={cn("realora-range", className)}
      style={
        {
          ...style,
          "--range-progress": `${Math.min(100, Math.max(0, pct))}%`,
        } as CSSProperties
      }
    />
  );
}
