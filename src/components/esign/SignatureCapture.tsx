"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { NATIVE_CONSENT_TEXT } from "@/lib/services/esign-native-client";

export type SignatureCaptureResult = {
  pngDataUrl: string;
  method: "draw";
};

const CANVAS_W = 480;
const CANVAS_H = 160;

export function SignatureCapture({
  open,
  title = "Sign",
  signerName,
  busy = false,
  error = "",
  onClose,
  onSign,
}: {
  open: boolean;
  title?: string;
  signerName: string;
  busy?: boolean;
  /** Shown inside the modal so prep/sign failures are not hidden behind it. */
  error?: string;
  onClose: () => void;
  /** Pressing Sign is the execution act — parent sends the image to the server. */
  onSign: (result: SignatureCaptureResult) => void | Promise<void>;
}) {
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open) return;
    setHasInk(false);
    const id = window.requestAnimationFrame(() => clearCanvas());
    return () => window.cancelAnimationFrame(id);
  }, [open, signerName]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    ctx.strokeStyle = "#102c25";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function onPointerUp() {
    drawing.current = false;
  }

  /** Crop to ink bounds so the agreement preview shows the strokes, not empty canvas. */
  function exportPngDataUrl(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas.toDataURL("image/png");
    const { width, height } = canvas;
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = pixels[i]!;
        const g = pixels[i + 1]!;
        const b = pixels[i + 2]!;
        // Non-white ink (canvas clear is #ffffff).
        if (r < 250 || g < 250 || b < 250) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return canvas.toDataURL("image/png");
    const pad = 12;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(width - sx, maxX - minX + pad * 2);
    const sh = Math.min(height - sy, maxY - minY + pad * 2);
    const cropped = document.createElement("canvas");
    cropped.width = sw;
    cropped.height = sh;
    const cctx = cropped.getContext("2d");
    if (!cctx) return canvas.toDataURL("image/png");
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, sw, sh);
    cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropped.toDataURL("image/png");
  }

  async function commit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    await onSign({ pngDataUrl: exportPngDataUrl(canvas), method: "draw" });
  }

  return (
    <Modal open={open} title={title} onClose={busy ? () => undefined : onClose} size="md">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="h-40 w-full cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={clearCanvas}>
            Clear
          </Button>
        </div>

        <p className="text-sm leading-5 text-muted">{NATIVE_CONSENT_TEXT}</p>

        {error ? <p className="text-sm leading-5 text-red-700">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="lime"
            disabled={busy || !hasInk}
            onClick={() => void commit()}
          >
            {busy ? "Signing…" : "Sign"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
