import { Button as UiButton } from "@/components/ui/Button";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "lime" | "ghost" | "dark" | "outline" | "pine" | "sand";

const alias: Record<string, "primary" | "lime" | "ghost" | "dark" | "outline"> = {
  pine: "dark",
  sand: "outline",
};

export function Button({
  variant = "primary",
  size: _size,
  href,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  href?: string;
  children: ReactNode;
}) {
  void _size;
  const mapped = (alias[variant] ?? variant) as "primary" | "lime" | "ghost" | "dark" | "outline";
  return (
    <UiButton variant={mapped} href={href} className={className} {...props}>
      {children}
    </UiButton>
  );
}
