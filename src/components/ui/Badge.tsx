import { cn } from "@/lib/format";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "lime" | "warn" | "good" | "sold" | "dark";
}) {
  const tones = {
    neutral: "bg-warm text-forest",
    lime: "bg-lime text-forest",
    warn: "bg-[#F6E2C3] text-forest",
    good: "bg-[#D8F0D5] text-forest",
    sold: "bg-[#dc2626] text-cream",
    dark: "bg-forest text-cream",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
