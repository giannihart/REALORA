import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

export function CheckboxMark({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        checked ? "border-forest bg-forest" : "border-line bg-white",
        className,
      )}
    >
      <span
        className={cn(
          "block h-1.5 w-1.5 rounded-full",
          checked ? "bg-lime" : "bg-transparent",
        )}
      />
    </span>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  className,
  markClassName,
  ...props
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
  className?: string;
  markClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange" | "className" | "children">) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 text-sm text-forest",
        className,
      )}
    >
      <span className={cn("relative flex h-4 w-4 shrink-0 overflow-hidden", markClassName)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 cursor-pointer appearance-none opacity-0 outline-none"
          {...props}
        />
        <CheckboxMark
          checked={checked}
          className="peer-focus-visible:ring-1 peer-focus-visible:ring-inset peer-focus-visible:ring-lime"
        />
      </span>
      {children}
    </label>
  );
}
