import Link from "next/link";
import { cn } from "@/lib/format";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

type Variant = "primary" | "lime" | "ghost" | "dark" | "outline";

const styles: Record<Variant, string> = {
  primary:
    "bg-forest text-cream hover:bg-forest-deep disabled:opacity-50",
  lime: "bg-lime text-forest hover:brightness-95",
  ghost: "bg-transparent text-forest hover:bg-warm",
  dark: "bg-forest-deep text-cream hover:bg-forest",
  outline: "border border-line bg-white text-forest hover:bg-warm",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  href?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  href,
  className,
  children,
  ...props
}: Props) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
    styles[variant],
    className,
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cls}
        onClick={props.onClick as unknown as MouseEventHandler<HTMLAnchorElement>}
      >
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
