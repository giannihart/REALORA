"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { X } from "lucide-react";
import { PHOTO_BLUR } from "@/lib/media";
import type { Listing } from "@/lib/types";

export default function GalleryLightbox({
  listing,
  lightbox,
  onLightbox,
  mediaPreview,
  onMediaPreview,
}: {
  listing: Listing;
  lightbox: boolean;
  onLightbox: (open: boolean) => void;
  mediaPreview: "3d" | "video" | null;
  onMediaPreview: (v: "3d" | "video" | null) => void;
}) {
  const photos = listing.photos;
  const media = photos[1] ?? photos[0];

  return (
    <>
      <Dialog.Root open={lightbox} onOpenChange={onLightbox}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-[rgba(11,31,26,0.72)]" />
          <Dialog.Content className="anim-rise-free shadow-raised fixed inset-4 z-50 overflow-auto rounded-[24px] border border-line bg-cream p-6 md:inset-10">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-medium tracking-tight">
                Photos · {listing.address}
              </Dialog.Title>
              <Dialog.Close aria-label="Close photos" className="ctrl grid h-11 w-11 place-items-center rounded-full bg-white">
                <X className="h-5 w-5" strokeWidth={1.75} />
              </Dialog.Close>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((src, i) => (
                <div key={src + i} className="photo-grade relative aspect-[4/3] overflow-hidden rounded-[20px]">
                  <Image src={src} alt="" fill className="object-cover" sizes="50vw" placeholder="blur" blurDataURL={PHOTO_BLUR} />
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(mediaPreview)} onOpenChange={() => onMediaPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-[rgba(11,31,26,0.55)]" />
          <Dialog.Content className="anim-rise shadow-raised fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100%-32px))] rounded-[24px] border border-line bg-white p-8">
            <Dialog.Title className="text-xl font-medium tracking-tight">
              {mediaPreview === "3d" ? "3D tour" : "Watch video"}
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-muted" style={{ lineHeight: 1.55 }}>
              Media preview. A walkthrough player will sit here when this listing
              has live tour or video media available.
            </Dialog.Description>
            <div className="photo-grade relative mt-6 aspect-video overflow-hidden rounded-[16px]">
              <Image src={media} alt="" fill className="object-cover" sizes="520px" placeholder="blur" blurDataURL={PHOTO_BLUR} />
            </div>
            <div className="mt-6 flex justify-end">
              <Dialog.Close className="ctrl rounded-full bg-forest-deep px-5 h-11 text-sm font-semibold text-cream">
                Close
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
