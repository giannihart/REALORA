const MAX_DIMENSION = 2400;
const QUALITY = 0.8;

function blobToFile(blob: Blob, name: string, type: string): File {
  const base = name.replace(/\.[^.]+$/, "");
  const ext = type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${base}.${ext}`, { type });
}

export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

  const webp = await toBlob("image/webp");
  if (webp && webp.size > 0) return blobToFile(webp, file.name, "image/webp");
  const jpeg = await toBlob("image/jpeg");
  if (jpeg && jpeg.size > 0) return blobToFile(jpeg, file.name, "image/jpeg");
  return file;
}

export async function compressImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    out.push(await compressImageFile(file));
  }
  return out;
}
