import { cn } from "@/lib/format";

const SKYLINE_SRC = "/nyc-skyline.png?v=2";

/** Tone-on-tone NYC skyline silhouette via CSS mask. Color with `text-*`. */
export function NycSkylineMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("bg-current", className)}
      style={{
        maskImage: `url(${SKYLINE_SRC})`,
        WebkitMaskImage: `url(${SKYLINE_SRC})`,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "bottom",
        WebkitMaskPosition: "bottom",
      }}
    />
  );
}
