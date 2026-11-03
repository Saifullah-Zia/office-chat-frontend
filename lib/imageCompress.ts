/**
 * Shrinks phone photos before upload (often 3–8 MB) to a size that still reads well on screen,
 * which saves the sender's data, server storage and everyone's downloads.
 * GIFs (animation), SVGs and small images are sent as they are; so is anything that wouldn't shrink.
 */
const MAX_SIDE = 2048;            // plenty for screenshots of claims/EOBs to stay legible
const QUALITY = 0.85;
const SKIP_BELOW_BYTES = 400_000; // already small

export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // PNGs can be transparent: keep them as WebP (which keeps transparency) instead of JPEG.
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, QUALITY));
    // toBlob falls back to PNG where WebP isn't supported (older Safari); only use a real saving.
    if (!blob || blob.type !== type || blob.size >= file.size * 0.9) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/jpeg" ? ".jpg" : ".webp");
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file; // unreadable image: upload the original
  }
}
