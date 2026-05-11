/**
 * Clipboard Utilities
 *
 * Uses @mariozechner/clipboard (clipboard-rs) for cross-platform clipboard support.
 * Supports: macOS, Linux, Windows
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getAttachmentsDir } from "../../agent/session-store.js";
import Clipboard from "@mariozechner/clipboard";

/** Text length threshold for auto-saving to file */
const LONG_TEXT_THRESHOLD = 5000;

/** Generate a unique identifier */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Get or create the attachments directory */
function ensureAttachmentsDir(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const baseDir = getAttachmentsDir(sessionId);
  if (!baseDir) return null;

  const textsDir = join(baseDir, "texts");
  if (!existsSync(textsDir)) {
    mkdirSync(textsDir, { recursive: true });
  }
  const imagesDir = join(baseDir, "images");
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  return baseDir;
}

/** Read text from system clipboard */
export function readClipboardText(): string | null {
  try {
    const text = Clipboard.getText();
    return text || null;
  } catch {
    return null;
  }
}

/** Check if clipboard contains an image */
export async function checkHasClipboardImage(): Promise<boolean> {
  try {
    return await Clipboard.hasImage();
  } catch {
    return false;
  }
}

/** Read image from system clipboard as Buffer */
export async function readClipboardImage(): Promise<Buffer | null> {
  try {
    const hasImage = await Clipboard.hasImage();
    if (!hasImage) return null;

    const base64 = await Clipboard.getImageBase64();
    if (!base64) return null;

    // Remove data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64Data, "base64");
  } catch {
    return null;
  }
}

/** Save text to session attachments if too long */
export function processTextForSubmission(
  text: string,
  sessionId: string | null
): { text: string; savedToFile: boolean } {
  if (text.length > LONG_TEXT_THRESHOLD) {
    const baseDir = ensureAttachmentsDir(sessionId);
    if (!baseDir) {
      return { text, savedToFile: false };
    }

    const id = generateId();
    const filePath = join(baseDir, "texts", `${id}.txt`);
    writeFileSync(filePath, text, "utf-8");

    return { text: `Text:${filePath}`, savedToFile: true };
  }

  return { text, savedToFile: false };
}

/** Save image to session attachments */
export async function processImageForSubmission(
  imageData: Buffer,
  sessionId: string | null
): Promise<{ text: string; savedToFile: boolean }> {
  const baseDir = ensureAttachmentsDir(sessionId);
  if (!baseDir) {
    return { text: "[Image:clipboard]", savedToFile: false };
  }

  const id = generateId();
  const filePath = join(baseDir, "images", `${id}.png`);
  writeFileSync(filePath, imageData);

  return { text: `[Image:${filePath}]`, savedToFile: true };
}
