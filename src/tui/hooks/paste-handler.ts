/**
 * Paste Handler Hook
 *
 * Handles paste events for files, images, and large text.
 */

import { useCallback, useRef } from "react";
import type { PasteEvent } from "@opentui/core";
import {
  readClipboardText,
  readClipboardImage,
  processTextForSubmission,
  processImageForSubmission,
} from "./clipboard.js";

/** Decode paste bytes to string (same logic as OpenTUI's decodePasteBytes) */
function decodePasteBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * usePasteHandler - React hook for handling paste events
 *
 * @param sessionId - Current session ID for attachment storage
 * @param insertIntoInput - Callback to insert text at cursor position
 */
export function usePasteHandler(
  sessionId: string | null,
  insertIntoInput: (text: string) => void
) {
  /** Reference to track if we're currently processing a paste */
  const processingRef = useRef(false);

  /**
   * Main paste handler - reads from system clipboard and processes content.
   * Returns true if the paste was handled (caller should call event.preventDefault()).
   */
  const handlePaste = useCallback(async (event?: PasteEvent): Promise<boolean> => {
    if (processingRef.current) return false;
    processingRef.current = true;

    const log = (msg: string) => {
      const fs = require("fs") as typeof import("fs");
      fs.appendFileSync("/tmp/koi-paste.log", `[${new Date().toISOString()}] [paste-handler] ${msg}\n`);
    };

    log(`start, event: ${event ? "yes" : "no"}`);

    try {
      // First, try to read image from clipboard (cross-platform)
      log("checking clipboard image...");
      const imageData = await readClipboardImage();
      log(`image result: ${imageData ? imageData.length + " bytes" : "null"}`);
      
      if (imageData && imageData.length > 0) {
        log("processing image...");
        const result = await processImageForSubmission(imageData, sessionId);
        log(`inserting: ${result.text}`);
        insertIntoInput(result.text);
        return true;
      }

      // Try to read text from OpenTUI PasteEvent if available
      if (event?.bytes && event.bytes.length > 0) {
        log(`using paste event bytes: ${event.bytes.length}`);
        const text = decodePasteBytes(event.bytes);
        if (text) {
          log(`inserting text: ${text.substring(0, 30)}`);
          const result = processTextForSubmission(text, sessionId);
          insertIntoInput(result.insertText);
          return true;
        }
      }

      // Fallback: try to read text from clipboard
      log("checking clipboard text...");
      const text = readClipboardText();
      log(`text result: ${text ? `"${text.substring(0, 30)}..."` : "null"}`);
      
      if (text !== null) {
        const result = processTextForSubmission(text, sessionId);
        insertIntoInput(result.insertText);
        return true;
      }

      log("no content found");
      return false;
    } catch (e) {
      log(`error: ${e}`);
      return false;
    } finally {
      processingRef.current = false;
    }
  }, [sessionId, insertIntoInput]);

  return { handlePaste };
}
