"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Box, Play } from "lucide-react";
import { PHOTO_BLUR } from "@/lib/media";
import type { Listing } from "@/lib/types";

const GalleryLightbox = dynamic(() => import("./GalleryLightbox"), { ssr: false });

export function Gallery({ listing }: { listing: Listing }) {
  const photos = listing.photos;
  const [lightbox, setLightbox] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<"3d" | "video" | null>(null);
  const media = photos[1] ?? photos[0];

  return (
    <>
      <div className="grid gap-2 md:grid-cols-4 md:grid-rows-2 md:h-[460px]">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="photo-grade relative col-span-2 row-span-2 min-h-[240px] overflow-hidden rounded-[24px] md:min-h-0"
        >
          <Image
            src={photos[0]}
            alt={`${listing.address} exterior`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
            placeholder="blur"
            blurDataURL={PHOTO_BLUR}
            style={{ objectPosition: listing.objectPosition ?? "50% 55%" }}
          />
        </button>
        {photos.slice(1, 3).map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setLightbox(true)}
            className="photo-grade relative hidden overflow-hidden rounded-[20px] md:block"
          >
            <Image
              src={src}
              alt=""
              fill
              className="object-cover"
              sizes="25vw"
              placeholder="blur"
              blurDataURL={PHOTO_BLUR}
              style={{ objectPosition: i === 0 ? "50% 40%" : "50% 50%" }}
            />
          </button>
        ))}
        <div className="relative hidden overflow-hidden rounded-[20px] md:block">
          <button
            type="button"
            onClick={() => setMediaPreview("3d")}
            className="photo-grade relative h-1/2 w-full overflow-hidden"
          >
            <Image src={photos[3] ?? media} alt="" fill className="object-cover" sizes="25vw" placeholder="blur" blurDataURL={PHOTO_BLUR} />
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-1 bg-[rgba(11,31,26,0.28)] text-white">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-lime text-forest">
                <Box className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold">3D tour</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMediaPreview("video")}
            className="photo-grade relative h-1/2 w-full overflow-hidden"
          >
            <Image src={photos[4] ?? media} alt="" fill className="object-cover" sizes="25vw" placeholder="blur" blurDataURL={PHOTO_BLUR} />
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-1 bg-[rgba(11,31,26,0.28)] text-white">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-lime text-forest">
                <Play className="h-5 w-5 fill-forest" strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold">Watch video</span>
            </div>
          </button>
        </div>
      </div>

      {lightbox || mediaPreview ? (
        <GalleryLightbox
          listing={listing}
          lightbox={lightbox}
          onLightbox={setLightbox}
          mediaPreview={mediaPreview}
          onMediaPreview={setMediaPreview}
        />
      ) : null}
    </>
  );
}
