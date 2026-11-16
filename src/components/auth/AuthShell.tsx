import type { ReactNode } from "react";

export function AuthShell({
  title,
  back,
  children,
  footer,
}: {
  title: string;
  back?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100svh-3.5rem)]">
      <div className={`mx-auto max-w-xl px-4 pb-12 ${back ? "pt-3" : "pt-12"}`}>
        {back ? <div className="mb-3">{back}</div> : null}
        <h1 className="font-sans text-3xl font-medium tracking-tight text-forest">
          {title}
        </h1>
        <div className="mt-8 space-y-3 rounded-3xl border border-line bg-white p-6">
          {children}
        </div>
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
