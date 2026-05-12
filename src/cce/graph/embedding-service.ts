/**
 * Embedding service for Cat's Context Engine.
 *
 * Supports local ONNX embedding via @huggingface/transformers.
 * Falls back to OpenAI API if configured.
 */

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "path";
import os from "os";
import fs from "fs";

const CACHE_DIR = path.join(os.homedir(), ".config", "koi", "cce", "models");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface EmbeddingDownloadProgress {
  file: string;
  progress: number;
  loaded: number;
  total: number;
  speed: number;
}

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private readyPromise: Promise<void> | null = null;
  private dimensions = 384;
  private modelName = "Xenova/all-MiniLM-L6-v2";
  private cache = new Map<string, Float32Array>();
  private cacheLimit = 5000;

  async init(onProgress?: (progress: EmbeddingDownloadProgress) => void): Promise<void> {
    if (this.extractor) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = this._loadModel(onProgress).catch((err) => {
      this.readyPromise = null;
      throw err;
    });
    return this.readyPromise;
  }

  private async _loadModel(onProgress?: (progress: EmbeddingDownloadProgress) => void): Promise<void> {
    ensureDir(CACHE_DIR);
    let lastLoaded = 0;
    let lastTime = Date.now();
    let currentFile = "";
    try {
      this.extractor = await pipeline("feature-extraction", this.modelName, {
        cache_dir: CACHE_DIR,
        dtype: "fp32",
        // @ts-expect-error progress_callback exists at runtime but TypeScript inference from JS source is incomplete
        progress_callback: onProgress
          ? (data: unknown) => {
              const d = data as Record<string, unknown>;
              const file = String(d["file"] ?? this.modelName);
              const status = d["status"] as string | undefined;

              // Reset speed tracking when a new file starts
              if (file !== currentFile) {
                currentFile = file;
                lastLoaded = 0;
                lastTime = Date.now();
              }

              // Handle progress events (from FileCache.put or readResponse)
              const hasProgress = typeof d["progress"] === "number";
              const hasLoaded = typeof d["loaded"] === "number";
              const hasTotal = typeof d["total"] === "number";
              if (hasProgress && hasLoaded && hasTotal) {
                const now = Date.now();
                const elapsed = (now - lastTime) / 1000;
                const loaded = d["loaded"] as number;
                const speed = elapsed > 0 ? Math.round((loaded - lastLoaded) / elapsed) : 0;
                lastLoaded = loaded;
                lastTime = now;
                onProgress({
                  file,
                  progress: Number(d["progress"] ?? 0),
                  loaded,
                  total: d["total"] as number,
                  speed,
                });
                return;
              }

              // For initiate/download/done events without numeric progress, send a 0% pulse
              // so the UI knows which file is being processed
              if (status === "initiate" || status === "download") {
                onProgress({
                  file,
                  progress: 0,
                  loaded: 0,
                  total: 0,
                  speed: 0,
                });
              }
            }
          : undefined,
      });
    } catch (err) {
      console.error("[CCE] Failed to load embedding model:", err);
      throw err;
    }
  }

  get isReady(): boolean {
    return this.extractor !== null;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    await this.init();
    if (!this.extractor) throw new Error("Embedding model not loaded");

    const results: Float32Array[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]!;
      const key = text.slice(0, 200);
      const cached = this.cache.get(key);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    if (uncachedTexts.length > 0) {
      // Batch in groups of 8 to avoid memory spikes
      const batchSize = 8;
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const outputs = await this.extractor(batch, { pooling: "mean", normalize: true });
        const outTensor = outputs as unknown as { data: Float32Array; dims: number[] };
        const data = outTensor.data;
        const dims = outTensor.dims;

        if (dims.length === 1) {
          // Single embedding [embedding_dim]
          const vec = data;
          const idx = uncachedIndices[i]!;
          results[idx] = vec;
          if (this.cache.size < this.cacheLimit) {
            this.cache.set(batch[0]!.slice(0, 200), vec);
          }
        } else {
          // Batch of embeddings [batch_size, embedding_dim]
          const embedDim = dims[1]!;
          for (let j = 0; j < batch.length; j++) {
            const vec = data.slice(j * embedDim, (j + 1) * embedDim);
            const idx = uncachedIndices[i + j]!;
            results[idx] = vec;
            if (this.cache.size < this.cacheLimit) {
              this.cache.set(batch[j]!.slice(0, 200), vec);
            }
          }
        }
      }
    }

    return results;
  }

  async embedSingle(text: string): Promise<Float32Array> {
    const results = await this.embed([text]);
    return results[0]!;
  }

  get dims(): number {
    return this.dimensions;
  }

  serialize(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer);
  }

  deserialize(buf: Buffer): Float32Array {
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }

  reset(): void {
    this.extractor = null;
    this.readyPromise = null;
    this.cache.clear();
  }
}

// Singleton
let _instance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!_instance) _instance = new EmbeddingService();
  return _instance;
}
