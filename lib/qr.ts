import QRCode from "qrcode";

/** Share of the code a centre logo (with its white box) may cover. Level H survives losing far more; kept low so worn prints still scan. */
const LOGO_AREA = 0.06;
const LOGO_MAX_SIDE = 0.34;
const QUIET_ZONE = 4; // blank border scanners need, in modules

/** Width / height, read from the PNG's header. */
function pngAspect(dataUrl: string): number {
  const head = atob(dataUrl.slice(dataUrl.indexOf(",") + 1).slice(0, 32));
  const at = (i: number) => head.charCodeAt(i) * 2 ** 24 + head.charCodeAt(i + 1) * 2 ** 16 + head.charCodeAt(i + 2) * 2 ** 8 + head.charCodeAt(i + 3);
  const w = at(16), h = at(20);
  return w > 0 && h > 0 ? w / h : 1;
}

/** The code as SVG text. `logo` is a PNG data URL, drawn in the middle on a white box. */
export async function qrSvg(content: string, color: string, logo?: string | null, width = 1600): Promise<string> {
  const errorCorrectionLevel = logo ? "H" : "Q";
  const svg = await QRCode.toString(content, {
    type: "svg", width, margin: QUIET_ZONE, errorCorrectionLevel, color: { dark: color, light: "#ffffff" },
  });
  if (!logo) return svg;
  const modules = QRCode.create(content, { errorCorrectionLevel }).modules.size;
  const total = modules + QUIET_ZONE * 2;
  const aspect = pngAspect(logo);
  let w = Math.sqrt(LOGO_AREA * aspect);
  let h = w / aspect;
  const shrink = Math.min(1, LOGO_MAX_SIDE / Math.max(w, h));
  w *= shrink * modules;
  h *= shrink * modules;
  const x = (total - w) / 2, y = (total - h) / 2;
  const pad = Math.min(w, h) * 0.07;
  return svg.replace("</svg>",
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${pad * 2}" fill="#ffffff"/>`
    + `<image x="${x + pad}" y="${y + pad}" width="${w - pad * 2}" height="${h - pad * 2}" href="${logo}"/></svg>`);
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image couldn't be read"));
    img.src = src;
  });
}

export async function qrPng(content: string, color: string, logo?: string | null, size = 1600): Promise<Blob> {
  const img = await loadImage(svgDataUrl(await qrSvg(content, color, logo, size)));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/png"));
}

/** An uploaded picture as a small PNG data URL (longest side 320px, empty borders cut off). */
export async function readLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const work = document.createElement("canvas");
    work.width = Math.max(1, Math.round(img.naturalWidth * scale));
    work.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = work.getContext("2d")!;
    ctx.drawImage(img, 0, 0, work.width, work.height);

    // Transparent or white borders would only make the logo smaller.
    const px = ctx.getImageData(0, 0, work.width, work.height).data;
    let left = work.width, right = -1, top = work.height, bottom = -1;
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        const i = (y * work.width + x) * 4;
        if (px[i + 3] < 20 || (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245)) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) throw new Error("This picture is blank or all white: it wouldn't show on the QR code.");
    const w = right - left + 1, h = bottom - top + 1;
    const fit = Math.min(1, 320 / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * fit));
    out.height = Math.max(1, Math.round(h * fit));
    out.getContext("2d")!.drawImage(work, left, top, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
