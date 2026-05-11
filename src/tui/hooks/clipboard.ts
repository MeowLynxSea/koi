/**
 * Clipboard Utilities
 *
 * Uses @mariozechner/clipboard (clipboard-rs) for cross-platform clipboard support.
 * Supports: macOS, Linux, Windows
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, statSync } from "fs";
import { join, extname, basename } from "path";
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
  const filesDir = join(baseDir, "files");
  if (!existsSync(filesDir)) {
    mkdirSync(filesDir, { recursive: true });
  }

  return baseDir;
}

/** Read file path from clipboard (macOS file copy) */
export async function readClipboardFilePath(): Promise<string | null> {
  const log = (...args: unknown[]) => {
    const fs = require("fs") as typeof import("fs");
    fs.appendFileSync("/tmp/koi-paste.log", `[${new Date().toISOString()}] [clipboard] ${args.join(" ")}\n`);
  };

  try {
    log("checking clipboard file path");
    
    const formats = Clipboard.availableFormats();
    log(`formats: ${JSON.stringify(formats)}`);
    
    if (!formats) {
      log("no formats available");
      return null;
    }
    
    // Check for file-related formats
    const hasFile = formats.some(f => 
      f.includes("file") || 
      f.includes("public.file-url") ||
      f.includes("public.url") ||
      f === "public.filename" ||
      f === "com.apple.traditional-mac-plain-text"
    );
    
    log(`hasFile: ${hasFile}`);
    if (!hasFile) return null;
    
    // Get text from clipboard
    let text: string | null = null;
    const result = Clipboard.getText();
    if (result instanceof Promise) {
      text = await result;
    } else if (typeof result === "string") {
      text = result;
    }
    log(`text from clipboard: "${text}"`);
    
    // Check if it's a valid file path
    if (text) {
      // macOS file path typically starts with / or ~, or is a file:// URL
      if (text.startsWith('/') || text.startsWith('~')) {
        if (existsSync(text)) {
          const stat = statSync(text);
          if (stat.isFile()) {
            log(`verified file: ${text}`);
            return text;
          }
        }
      }
      
      // Handle file:// URLs
      if (text.startsWith('file://')) {
        const filePath = decodeURIComponent(text.replace('file://', ''));
        if (existsSync(filePath)) {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            log(`verified file from URL: ${filePath}`);
            return filePath;
          }
        }
      }
    }
    
    return null;
  } catch (e) {
    log(`error: ${e}`);
    return null;
  }
}

/** Read text from system clipboard */
export async function readClipboardText(): Promise<string | null> {
  const log = (...args: unknown[]) => {
    const fs = require("fs") as typeof import("fs");
    fs.appendFileSync("/tmp/koi-paste.log", `[${new Date().toISOString()}] [clipboard] ${args.join(" ")}\n`);
  };

  try {
    log("reading text from clipboard");
    // clipboard-rs getText may be sync or async depending on platform
    let text: string | null = null;
    const result = Clipboard.getText();
    if (result instanceof Promise) {
      text = await result;
    } else if (typeof result === "string") {
      text = result;
    }
    log(`text: "${text?.substring(0, 100)}..."`);
    return text || null;
  } catch (e) {
    log(`error reading text: ${e}`);
    return null;
  }
}

/** Synchronous wrapper for readClipboardText */
export function readClipboardTextSync(): string | null {
  try {
    // Note: getText is async, but we provide sync fallback
    // In practice, clipboard-rs getText returns synchronously in some contexts
    const text = Clipboard.getText();
    if (text instanceof Promise) {
      return null; // Can't await in sync context
    }
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
  const log = (...args: unknown[]) => {
    const fs = require("fs") as typeof import("fs");
    fs.appendFileSync("/tmp/koi-paste.log", `[${new Date().toISOString()}] [clipboard] ${args.join(" ")}\n`);
  };

  try {
    log("checking for image");
    let hasImage: boolean = false;
    const hasImageResult = Clipboard.hasImage();
    hasImage = hasImageResult instanceof Promise ? await hasImageResult : hasImageResult;
    log(`hasImage: ${hasImage}`);
    if (!hasImage) return null;

    let base64: string | null = null;
    const base64Result = Clipboard.getImageBase64();
    base64 = base64Result instanceof Promise ? await base64Result : base64Result;
    log(`got base64: ${base64 ? base64.length + " chars" : "null"}`);
    if (!base64) return null;

    // Remove data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    log(`image buffer: ${buffer.length} bytes`);
    return buffer;
  } catch (e) {
    log(`error reading image: ${e}`);
    return null;
  }
}

/** Save text to session attachments if too long */
export function processTextForSubmission(
  text: string,
  sessionId: string | null
): { insertText: string; savedToFile: boolean } {
  if (text.length > LONG_TEXT_THRESHOLD) {
    const baseDir = ensureAttachmentsDir(sessionId);
    if (!baseDir) {
      return { insertText: text, savedToFile: false };
    }

    const id = generateId();
    const filePath = join(baseDir, "texts", `${id}.txt`);
    writeFileSync(filePath, text, "utf-8");

    return { insertText: `Text:${filePath}`, savedToFile: true };
  }

  return { insertText: text, savedToFile: false };
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

/** Clone file to session attachments and return the path */
export function processFileForSubmission(
  filePath: string,
  sessionId: string | null
): string | null {
  try {
    if (!filePath || !existsSync(filePath)) {
      return null;
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }

    const baseDir = ensureAttachmentsDir(sessionId);
    if (!baseDir) {
      // Return original path if can't save to attachments
      return `File:${filePath}`;
    }

    // Preserve original filename but add unique prefix to avoid collisions
    const ext = extname(filePath);
    const nameWithoutExt = basename(filePath, ext);
    const id = generateId();
    const newFileName = `${nameWithoutExt}-${id}${ext}`;
    const newPath = join(baseDir, "files", newFileName);

    copyFileSync(filePath, newPath);
    return newPath;
  } catch {
    return null;
  }
}
