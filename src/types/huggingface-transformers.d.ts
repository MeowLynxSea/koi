declare module "@huggingface/transformers" {
  export interface FeatureExtractionPipelineOptions {
    pooling?: "mean" | "cls" | "none";
    normalize?: boolean;
  }

  export interface FeatureExtractionPipeline {
    (inputs: string[], options?: FeatureExtractionPipelineOptions): Promise<Float32Array[]>;
    (input: string, options?: FeatureExtractionPipelineOptions): Promise<Float32Array>;
  }

  export function pipeline(
    task: "feature-extraction",
    model?: string,
    options?: {
      cache_dir?: string;
      dtype?: "fp32" | "fp16" | "q8" | "int8" | "uint8" | "bnb4" | "q4";
    }
  ): Promise<FeatureExtractionPipeline>;
}
