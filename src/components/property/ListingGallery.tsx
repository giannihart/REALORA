"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, ChevronLeft, ChevronRight, Play, X } from "lucide-react";

type Slide =
  | { kind: "photo"; src: string }
  | { kind: "tour" }
  | { kind: "video" };

export function ListingGallery({
  images,
  title,
  coverOnly = false,
}: {
  images: string[];
  title: string;
  coverOnly?: boolean;
}) {
  const photos = coverOnly ? images.slice(0, 1) : images.filter(Boolean);
  const photoLabel = `View all ${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  const primary = photos[0];
  const second = photos[1] ?? photos[0];
  const third = photos[2] ?? photos[1] ?? photos[0];

  const slides = useMemo<Slide[]>(() => {
    const photoSlides: Slide[] = photos.map((src) => ({ kind: "photo", src }));
    if (coverOnly) return photoSlides;
    return [...photoSlides, { kind: "tour" }, { kind: "video" }];
  }, [coverOnly, photos]);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const slide = slides[index] ?? slides[0];
  const canCycle = slides.length > 1;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, slides.length]);

  function step(delta: number) {
    if (slides.length < 2) return;
    setIndex((i) => (i + delta + slides.length) % slides.length);
  }

  function openAt(at: number) {
    setIndex(Math.min(Math.max(0, at), slides.length - 1));
    setOpen(true);
  }

  const photoIndex =
    slide?.kind === "photo"
      ? slides.slice(0, index + 1).filter((s) => s.kind === "photo").length
      : 0;
  const viewerLabel =
    slide?.kind === "photo"
      ? `Photos · ${photoIndex} / ${photos.length}`
      : slide?.kind === "tour"
        ? "3D tour · media preview"
        : "Property video · media preview";

  return (
    <>
      {/* Desktop: 2-column gallery (cover only on sold) */}
      <div
        className={
          coverOnly
            ? "hidden md:block"
            : "hidden gap-2 md:grid md:grid-cols-[1.55fr_1fr] md:grid-rows-1"
        }
      >
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group relative min-h-[420px] w-full overflow-hidden rounded-2xl bg-sand lg:min-h-[520px]"
          aria-label={coverOnly ? title : photoLabel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={primary}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          />
          {coverOnly ? null : (
            <span className="absolute bottom-3 left-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-medium text-forest shadow-sm">
              {photoLabel}
            </span>
          )}
        </button>

        {coverOnly ? null : (
        <div className="grid min-h-[420px] grid-rows-3 gap-2 lg:min-h-[520px]">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openAt(1)}
              className="group relative overflow-hidden rounded-2xl bg-sand"
              aria-label="View second photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={second}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
              />
            </button>
            <button
              type="button"
              onClick={() => openAt(2)}
              className="group relative overflow-hidden rounded-2xl bg-sand"
              aria-label="View third photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={third}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
              />
            </button>
          </div>

          <button
            type="button"
            onClick={() => openAt(photos.length)}
            className="group relative overflow-hidden rounded-2xl bg-forest"
            aria-label="Open 3D tour preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[3] ?? primary}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity duration-300 group-hover:opacity-40"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cream">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-forest">
                <Box size={20} />
              </span>
              <span className="text-sm font-semibold">3D tour</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => openAt(photos.length + 1)}
            className="group relative overflow-hidden rounded-2xl bg-forest"
            aria-label="Watch video preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[3] ?? photos[2] ?? primary}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity duration-300 group-hover:opacity-40"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cream">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime text-forest">
                <Play size={18} fill="currentColor" />
              </span>
              <span className="text-sm font-semibold">Watch video</span>
            </span>
          </button>
        </div>
        )}
      </div>

      {/* Mobile: stacked / swipeable strip */}
      <div className="md:hidden">
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
          {photos.slice(0, coverOnly ? 1 : 4).map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => openAt(i)}
              className={
                coverOnly
                  ? "relative w-full shrink-0 overflow-hidden rounded-2xl bg-sand"
                  : "relative w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl bg-sand"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
              {i === 0 && !coverOnly ? (
                <span className="absolute bottom-3 left-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-medium text-forest">
                  {photoLabel}
                </span>
              ) : null}
            </button>
          ))}
          {coverOnly ? null : (
            <>
          <button
            type="button"
            onClick={() => openAt(photos.length)}
            className="relative flex w-[70%] shrink-0 snap-center flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-forest text-cream"
          >
            <Box size={22} className="text-lime" />
            <span className="text-sm font-semibold">3D tour</span>
            <span className="text-[11px] text-cream/70">Media preview</span>
          </button>
          <button
            type="button"
            onClick={() => openAt(photos.length + 1)}
            className="relative flex w-[70%] shrink-0 snap-center flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-forest text-cream"
          >
            <Play size={20} className="text-lime" fill="currentColor" />
            <span className="text-sm font-semibold">Watch video</span>
            <span className="text-[11px] text-cream/70">Media preview</span>
          </button>
            </>
          )}
        </div>
      </div>

      {open && slide ? (
        <div
          className="fixed inset-0 z-[80] overflow-hidden bg-cream"
          role="dialog"
          aria-modal="true"
          aria-label={viewerLabel}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-forest shadow-sm transition hover:bg-warm"
            aria-label="Close media"
          >
            <X size={18} />
          </button>

          {slide.kind === "photo" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.src}
                alt=""
                className="absolute inset-y-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2"
              />
              <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cream/90 px-3 py-1 text-sm text-forest">
                {photoIndex} of {photos.length}
              </p>
            </>
          ) : null}

          {slide.kind === "tour" ? (
            <MediaStage
              src={photos[3] ?? primary}
              icon={<Box size={28} />}
              title="Interactive 3D tour"
              blurb=""
            />
          ) : null}

          {slide.kind === "video" ? (
            <MediaStage
              src={photos[0]}
              icon={<Play size={26} fill="currentColor" />}
              title="Property video"
              blurb=""
            />
          ) : null}

          {canCycle ? (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-forest shadow-sm transition hover:bg-warm"
                aria-label="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-forest shadow-sm transition hover:bg-warm"
                aria-label="Next"
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function MediaStage({
  src,
  icon,
  title,
  blurb,
}: {
  src?: string;
  icon: ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <div className="absolute inset-0 bg-cream">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover opacity-20" />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-forest">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lime text-forest">
          {icon}
        </span>
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-sm text-sm text-muted">{blurb}</p>
      </div>
    </div>
  );
}
