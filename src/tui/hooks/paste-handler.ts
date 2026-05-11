/**
 * Paste Handler Hook
 *
 * Handles paste events for files, images, and text.
 * - Text: short text sent directly, long text saved to file and path sent
 * - Images: saved to session attachments and [Image:path] sent
 * - Files: cloned to session attachments and path sent
 */

import { useCallback, useRef } from "react";
import {
  readClipboardText,
  readClipboardImage,
  readClipboardFilePath,
  processTextForSubmission,
  processImageForSubmission,
  processFileForSubmission,
} from "./clipboard.js";

/** Decode paste bytes to string */
function decodePasteBytes(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length === 0) return null;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
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
   * Handle image paste (used for Ctrl+V on Mac)
   * Only checks for image in clipboard.
   */
  const handleImagePaste = useCallback(async (): Promise<boolean> => {
    if (processingRef.current) return false;
    processingRef.current = true;

    try {
      const imageData = await readClipboardImage();
      if (imageData && imageData.length > 0) {
        const result = await processImageForSubmission(imageData, sessionId);
        insertIntoInput(result.text);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      processingRef.current = false;
    }
  }, [sessionId, insertIntoInput]);

  /**
   * Handle text/file paste (used for Command+V on Mac via textarea onPaste)
   * Checks for text and files, but not images.
   */
  const handleTextFilePaste = useCallback(async (event?: { bytes?: Uint8Array; metadata?: unknown }): Promise<boolean> => {
    if (processingRef.current) return false;
    processingRef.current = true;

    try {
      // Priority 1: If paste event has bytes, check if it's valid text
      if (event?.bytes && event.bytes.length > 0) {
        const decoded = decodePasteBytes(event.bytes);
        if (decoded && decoded.trim().length > 0) {
          // Check if it looks like text
          let printableCount = 0;
          const totalCount = decoded.length;
          for (const c of decoded) {
            const code = c.charCodeAt(0);
            if ((code >= 32 && code < 127) || code === 9 || code === 10 || code === 13) {
              printableCount++;
            } else if (code >= 128) {
              printableCount += 0.5;
            }
          }
          const printableRatio = printableCount / totalCount;
          
          // Only treat as text if printable ratio is high and content is reasonably sized
          if (printableRatio > 0.9 && decoded.length > 10) {
            const result = processTextForSubmission(decoded, sessionId);
            insertIntoInput(result.insertText);
            return true;
          }
        }
      }

      // Priority 2: Check for file
      const filePath = await readClipboardFilePath();
      if (filePath) {
        const newPath = processFileForSubmission(filePath, sessionId);
        if (newPath) {
          insertIntoInput(newPath);
          return true;
        }
      }

      // Priority 3: Fallback to clipboard text
      const text = await readClipboardText();
      if (text) {
        const result = processTextForSubmission(text, sessionId);
        insertIntoInput(result.insertText);
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      processingRef.current = false;
    }
  }, [sessionId, insertIntoInput]);

  /**
   * Full paste handler - reads from system clipboard and processes all content types.
   * Used by Ctrl+V global handler.
   */
  const handlePaste = useCallback(async (): Promise<boolean> => {
    if (processingRef.current) return false;
    processingRef.current = true;

    try {
      // Priority 1: Check for image (for Ctrl+V image paste)
      const imageData = await readClipboardImage();
      if (imageData && imageData.length > 0) {
        const result = await processImageForSubmission(imageData, sessionId);
        insertIntoInput(result.text);
        return true;
      }

      // Priority 2: Check for file
      const filePath = await readClipboardFilePath();
      if (filePath) {
        const newPath = processFileForSubmission(filePath, sessionId);
        if (newPath) {
          insertIntoInput(newPath);
          return true;
        }
      }

      // Priority 3: Fallback to text
      const text = await readClipboardText();
      if (text) {
        const result = processTextForSubmission(text, sessionId);
        insertIntoInput(result.insertText);
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      processingRef.current = false;
    }
  }, [sessionId, insertIntoInput]);

  return { handlePaste, handleImagePaste, handleTextFilePaste };
}
