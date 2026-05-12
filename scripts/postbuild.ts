/**
 * Post-build script to fix native module paths in the bundle.
 *
 * Some native modules (like onnxruntime-node) use relative paths that are
 * valid in node_modules but not when bundled. This script patches those paths.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const mainJsPath = join(distDir, "main.js");

if (!existsSync(mainJsPath)) {
  console.log("dist/main.js not found, skipping postbuild...");
  process.exit(0);
}

let content = readFileSync(mainJsPath, "utf-8");

// Fix onnxruntime-node path: ../bin/... -> ./bin/...
// The original code uses "../bin/napi-v3/..." which is relative to
// node_modules/onnxruntime-node/dist/, but when bundled, the path needs
// to be relative to dist/main.js
if (content.includes("../bin/napi-v3/")) {
  content = content.replace(/\.\.\/bin\/napi-v3\//g, "./onnx-bin/napi-v3/");
  writeFileSync(mainJsPath, content);
  console.log("Fixed onnxruntime-node native module path in bundle");
}

console.log("Postbuild complete.");
