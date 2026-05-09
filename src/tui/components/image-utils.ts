/**
 * Image Utilities
 *
 * Converts images to terminal-renderable half-block art using jimp.
 * Each terminal cell displays 2 vertical pixels as a single coloured
 * half-block character (▄), with bg = top pixel and fg = bottom pixel.
 */

import { Jimp } from "jimp";
import { existsSync } from "fs";
import { resolve } from "path";

export type ImageCell = { fg: string; bg: string };
export type ImageRow = ImageCell[];

function cacheKey(url: string, w: number, h: number): string {
  return `${url}::${w}x${h}`;
}

const imageCache = new Map<string, ImageRow[] | null>();

function rgbaToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      throw new Error("Image too large");
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function readImage(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const buffer = await fetchImageBuffer(url);
    return Jimp.fromBuffer(buffer);
  }

  const path = resolve(url);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return Jimp.read(path);
}

export async function imageToHalfBlocks(
  url: string,
  maxWidth: number,
  maxHeight: number
): Promise<ImageRow[] | null> {
  const key = cacheKey(url, maxWidth, maxHeight);
  if (imageCache.has(key)) {
    return imageCache.get(key)!;
  }

  try {
    const image = await readImage(url);

    // Scale to fit maxWidth x maxHeight terminal cells while preserving
    // the original aspect ratio. Each terminal row displays 2 image rows.
    const originalW = image.bitmap.width;
    const originalH = image.bitmap.height;

    const scale = Math.min(
      maxWidth / originalW,
      (maxHeight * 2) / originalH
    );

    const pixelW = Math.max(1, Math.round(originalW * scale));
    const pixelH = Math.max(1, Math.round(originalH * scale));

    image.resize({ w: pixelW, h: pixelH });

    const finalW = image.bitmap.width;
    const finalH = image.bitmap.height;
    const rows: ImageRow[] = [];

    for (let y = 0; y < finalH; y += 2) {
      const row: ImageCell[] = [];
      for (let x = 0; x < finalW; x++) {
        const topColor = image.getPixelColor(x, y);
        const topR = (topColor >>> 24) & 0xff;
        const topG = (topColor >>> 16) & 0xff;
        const topB = (topColor >>> 8) & 0xff;

        let bottomR = topR;
        let bottomG = topG;
        let bottomB = topB;

        if (y + 1 < finalH) {
          const bottomColor = image.getPixelColor(x, y + 1);
          bottomR = (bottomColor >>> 24) & 0xff;
          bottomG = (bottomColor >>> 16) & 0xff;
          bottomB = (bottomColor >>> 8) & 0xff;
        }

        row.push({
          bg: rgbaToHex(topR, topG, topB),
          fg: rgbaToHex(bottomR, bottomG, bottomB),
        });
      }
      rows.push(row);
    }

    imageCache.set(key, rows);
    return rows;
  } catch {
    imageCache.set(key, null);
    return null;
  }
}
