"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, ImagePlus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAppData } from "@/lib/data/use-app-data";
import { cn } from "@/lib/format";
import { compressImageFiles } from "@/lib/media/compress";
import type { Listing } from "@/lib/types";

const fieldClass =
  "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-forest outline-none focus:border-forest/40";

export function BrokerListingEditor({
  listingId,
  listing,
}: {
  listingId: string;
  listing: Listing;
}) {
  const fromStore = useAppData((s) => s.listings.find((l) => l.id === listingId));
  const live = fromStore ?? listing;

  const updateListing = useAppData((s) => s.updateListing);
  const reorderPhotos = useAppData((s) => s.reorderPhotos);
  const uploadListingMedia = useAppData((s) => s.uploadListingMedia);
  const deleteListingMedia = useAppData((s) => s.deleteListingMedia);

  const [address, setAddress] = useState(live.address);
  const [price, setPrice] = useState(String(live.price));
  const [beds, setBeds] = useState(String(live.beds));
  const [baths, setBaths] = useState(String(live.baths));
  const [sqft, setSqft] = useState(String(live.sqft));
  const [description, setDescription] = useState(live.about[0] ?? "");
  const [pricingGuidance, setPricingGuidance] = useState(live.pricingGuidance ?? "");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photos = live.photos ?? [];

  useEffect(() => {
    setAddress(live.address);
    setPrice(String(live.price));
    setBeds(String(live.beds));
    setBaths(String(live.baths));
    setSqft(String(live.sqft));
    setDescription(live.about[0] ?? "");
    setPricingGuidance(live.pricingGuidance ?? "");
  }, [
    live.address,
    live.price,
    live.beds,
    live.baths,
    live.sqft,
    live.about,
    live.pricingGuidance,
  ]);

  async function handleUpload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const compressed = await compressImageFiles(files);
      await uploadListingMedia?.(listingId, compressed);
      toast("Photos uploaded.");
    } catch {
      /* toast handled upstream */
    } finally {
      setUploading(false);
    }
  }

  function movePhoto(from: number, to: number) {
    if (from === to) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void Promise.resolve(reorderPhotos(listingId, next)).catch(() => undefined);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.resolve(
        updateListing(listingId, {
          address: address.trim() || live.address,
          price: Number(price) || live.price,
          beds: Number(beds) || 0,
          baths: Number(baths) || 0,
          sqft: Math.max(0, Math.round(Number(sqft) || 0)),
          about: [description, ...live.about.slice(1)],
          pricingGuidance: pricingGuidance.trim() || null,
        }),
      );
      toast("Listing production saved.");
    } catch {
      /* toast handled upstream */
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-forest">Listing production</h2>
          <p className="mt-0.5 text-sm text-muted">
            Facts, copy, cover photo, and pricing guidance for the seller.
          </p>
        </div>
        <Button className="rounded-xl" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-forest">Address</span>
          <input
            className={fieldClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-forest">Price</span>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-forest">Beds</span>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-forest">Baths</span>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-forest">Sqft</span>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-forest">Description</span>
          <textarea
            className={fieldClass}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-forest">Pricing guidance for seller</span>
          <textarea
            className={fieldClass}
            rows={3}
            value={pricingGuidance}
            onChange={(e) => setPricingGuidance(e.target.value)}
            placeholder="Private note shown on the seller dashboard"
          />
        </label>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-forest">Photos</h3>
            <p className="mt-0.5 text-xs text-muted">
              Drag to reorder · double-click or cover badge · first photo is the cover
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} strokeWidth={2} />
            {uploading ? "Uploading…" : "Add photos"}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void handleUpload(files);
          }}
        />

        {photos.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((src, i) => (
              <div
                key={src + i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null) return;
                  movePhoto(dragIndex, i);
                  setDragIndex(null);
                }}
                onDoubleClick={() => {
                  if (i === 0) return;
                  movePhoto(i, 0);
                }}
                className={cn(
                  "group relative aspect-[4/3] overflow-hidden rounded-xl bg-warm",
                  dragIndex === i && "opacity-60",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <div className="absolute left-2 top-2 flex items-center gap-1">
                  {i === 0 ? (
                    <Badge tone="dark">Cover</Badge>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full bg-forest/50 px-2 py-0.5 text-xs font-medium text-cream opacity-0 transition group-hover:opacity-100"
                      onClick={() => movePhoto(i, 0)}
                    >
                      Set cover
                    </button>
                  )}
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest/50 text-cream opacity-0 transition group-hover:opacity-100">
                    <GripVertical size={12} />
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-forest/70 text-cream opacity-0 transition hover:bg-forest group-hover:opacity-100"
                  onClick={() => {
                    void Promise.resolve(deleteListingMedia?.(listingId, src)).catch(
                      () => undefined,
                    );
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleUpload(
                [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")),
              );
            }}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-warm/40 px-4 py-10 text-center transition hover:border-forest/30 hover:bg-warm/70"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-forest shadow-sm">
              <ImagePlus size={18} strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium text-forest">
              {uploading ? "Uploading…" : "Add listing photos"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
