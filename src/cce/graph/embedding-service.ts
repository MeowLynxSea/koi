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

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private readyPromise: Promise<void> | null = null;
  private dimensions = 384;
  private modelName = "Xenova/all-MiniLM-L6-v2";
  private cache = new Map<string, Float32Array>();
  private cacheLimit = 5000;

  async init(): Promise<void> {
    if (this.extractor) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = this._loadModel();
    return this.readyPromise;
  }

  private async _loadModel(): Promise<void> {
    ensureDir(CACHE_DIR);
    try {
      this.extractor = await pipeline("feature-extraction", this.modelName, {
        cache_dir: CACHE_DIR,
        dtype: "fp32",
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
        for (let j = 0; j < batch.length; j++) {
          const vec = outputs[j]! as Float32Array;
          const idx = uncachedIndices[i + j]!;
          results[idx] = vec;
          if (this.cache.size < this.cacheLimit) {
            this.cache.set(batch[j]!.slice(0, 200), vec);
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
}

// Singleton
let _instance: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!_instance) _instance = new EmbeddingService();
  return _instance;
}
