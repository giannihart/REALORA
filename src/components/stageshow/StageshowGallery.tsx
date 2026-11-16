"use client";

import { REALORA_DEMOS } from "@/components/stageshow/RealoraDemos";

export function StageshowGallery() {
  const website = REALORA_DEMOS.filter((d) => d.Page === "Website");
  const portal = REALORA_DEMOS.filter((d) => d.Page === "Portal");

  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-cream px-4 py-12 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-sans text-3xl font-medium tracking-tight text-forest">
          Stageshow
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Faux Realora product UI for website and portal surfaces — framed
          stills for heroes, How it works, and feature cards.
        </p>

        <section className="mt-12">
          <h2 className="text-sm font-semibold text-forest">Website</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {website.map(({ id, label, Demo }) => (
              <article key={id} className="space-y-3">
                <p className="text-xs font-medium text-muted">{label}</p>
                <Demo />
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-sm font-semibold text-forest">Portal</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {portal.map(({ id, label, Demo }) => (
              <article key={id} className="space-y-3">
                <p className="text-xs font-medium text-muted">{label}</p>
                <Demo />
              </article>
            ))}
          </div>
        </section>

        {/* Keep Documents demo visible even if unused in HIW steps */}
        <section className="mt-14 hidden" aria-hidden>
          {/* reserved */}
        </section>
      </div>
    </div>
  );
}
