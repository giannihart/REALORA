import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  Complete: "bg-[#DFEDD8] text-[#2E5B34]",
  "In Progress": "bg-lime text-forest",
  "In progress": "bg-sand text-forest",
  Waiting: "bg-[#F7EBC6] text-[#7A6420]",
  Upcoming: "bg-sand text-muted",
  New: "bg-warm text-forest",
  "New Listing": "bg-lime text-forest",
  "Price Cut": "bg-forest-deep text-white",
  Signed: "bg-[#DFEDD8] text-[#2E5B34]",
  Pending: "bg-sand text-forest",
  "For review": "bg-[#F7EBC6] text-[#7A6420]",
  Accepted: "bg-[#DFEDD8] text-[#2E5B34]",
  Declined: "bg-warm text-muted",
  Countered: "bg-[#F7EBC6] text-[#7A6420]",
};

export function StatusPill({
  label,
  className,
  mutedProgress = false,
}: {
  label: string;
  className?: string;
  mutedProgress?: boolean;
}) {
  const key =
    mutedProgress && label === "In Progress" ? "In progress" : label;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap",
        styles[key] ?? "bg-sand text-forest",
        className,
      )}
    >
      {label}
    </span>
  );
}
