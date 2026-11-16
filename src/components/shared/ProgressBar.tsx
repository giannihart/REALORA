import { cn } from "@/lib/utils";

export function ProgressBar({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#EFE9DC]">
        <div
          className="h-full rounded-full bg-forest-deep"
          style={{
            width: `${pct}%`,
            transition: "width 500ms ease-out",
          }}
        />
      </div>
      <span className="nums text-sm font-semibold text-forest">
        {done}/{total}
      </span>
    </div>
  );
}
