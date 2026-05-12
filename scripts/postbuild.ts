/**
 * Post-build script to fix native module paths in the bundle.
 *
 * This replaces the dynamic import pattern used by @opentui/core:
 *   await import(`@opentui/core-${process.platform}-${process.arch}/index.js`)
 *
 * With a static path to the current platform's native library, copied to dist.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  readdirSync,
  rmSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const mainJsPath = join(distDir, "main.js");

if (!existsSync(mainJsPath)) {
  console.log("dist/main.js not found, skipping postbuild...");
  process.exit(0);
}

const platform = process.platform === "win32" ? "win32" : process.platform;
const arch = process.arch;
const platformModule = `@opentui/core-${platform}-${arch}`;

// Find the platform module in node_modules
const nodeModulesDir = join(rootDir, "node_modules");
const platformModulePath = join(nodeModulesDir, platformModule);

if (!existsSync(platformModulePath)) {
  console.error(`[postbuild] Platform module not found: ${platformModule}`);
  console.error(`[postbuild] Expected at: ${platformModulePath}`);
  process.exit(1);
}

let content = readFileSync(mainJsPath, "utf-8");

// Detect the native library file extension
let nativeLibExt: string;
switch (platform) {
  case "darwin":
    nativeLibExt = ".dylib";
    break;
  case "win32":
    nativeLibExt = ".dll";
    break;
  default:
    nativeLibExt = ".so";
}
const nativeLibName = `libopentui${nativeLibExt}`;
const nativeLibPath = join(platformModulePath, nativeLibName);

if (!existsSync(nativeLibPath)) {
  console.error(`[postbuild] Native library not found: ${nativeLibPath}`);
  process.exit(1);
}

// Create native/opentui directory in project root (not dist, so paths work at runtime)
// When running `bun run dist/main.js`, cwd is project root, so relative paths work
const opentuiNativeDir = join(rootDir, "native", "opentui");
if (!existsSync(opentuiNativeDir)) {
  mkdirSync(opentuiNativeDir, { recursive: true });
}

// Copy the native library
const destNativeLib = join(opentuiNativeDir, nativeLibName);
cpSync(nativeLibPath, destNativeLib);
console.log(`[postbuild] Copied ${nativeLibName} to native/opentui/`);

// Replace the dynamic import with a static path
// The dynamic import pattern:
//   var module = await import(`@opentui/core-${process.platform}-${process.arch}/index.js`);
//
// We replace it with:
//   var module = { default: "./native/opentui/libopentui.dylib" };
//   // OR better: directly inline the native library path resolution

const dynamicImportPattern = /var module = await import\(`@opentui\/core-\$\{process\.platform\}-\$\{process\.arch\}\/index\.js`\);?/g;

// The platform module's index.js does:
//   const module = await import("./libopentui.dylib", { with: { type: "file" } });
//   export default module.default;
//
// We can inline this directly with the correct path
const staticImport = `var module = { default: "./native/opentui/${nativeLibName}" };`;

if (content.includes("@opentui/core-")) {
  const matches = content.match(dynamicImportPattern);
  if (matches) {
    content = content.replace(dynamicImportPattern, staticImport);
    console.log(`[postbuild] Replaced ${matches.length} dynamic import(s) with static path`);
  }
}

// Also fix any relative path issues with the native library
// The original code might check for bunfs paths
if (content.includes("isBunfsPath")) {
  // The isBunfsPath check is no longer needed since we use relative path
  content = content.replace(
    /if \(isBunfsPath\(targetLibPath\)\) \{[\s\S]*?targetLibPath = targetLibPath\.replace\("\.\.\/", ""\);[\s\S]*?\}/,
    "// Native library path is already resolved"
  );
}

// Fix onnxruntime-node path: use process.cwd() to build dynamic path
if (content.includes("../bin/napi-v3/")) {
  // Replace the template literal with a dynamic path using process.cwd()
  const onnxRelPath = join("native", "onnx", "napi-v3", platform, arch).replace(/\\/g, "/");
  content = content.replace(
    /`\.\.\/bin\/napi-v3\/\$\{process\.platform\}\/\$\{process\.arch\}\/([^`]+)`/g,
    `path.join(process.cwd(), "${onnxRelPath}", "$1")`
  );
  console.log("[postbuild] Fixed onnxruntime-node native module path");

  // Copy onnxruntime-node native library for current platform
  const onnxSrcDir = join(nodeModulesDir, "onnxruntime-node", "bin", "napi-v3", platform, arch);
  const onnxDestDir = join(rootDir, "native", "onnx", "napi-v3", platform, arch);

  if (existsSync(onnxSrcDir)) {
    const files = readdirSync(onnxSrcDir);
    mkdirSync(onnxDestDir, { recursive: true });
    for (const file of files) {
      const src = join(onnxSrcDir, file);
      const dest = join(onnxDestDir, file);
      cpSync(src, dest);
    }
    console.log(`[postbuild] Copied onnxruntime native modules to native/onnx/`);
  } else {
    console.warn(`[postbuild] Warning: onnxruntime-node source not found at ${onnxSrcDir}`);
  }
}

// Clean up dist/node_modules (if it was created by previous build)
const distNodeModules = join(distDir, "node_modules");
if (existsSync(distNodeModules)) {
  rmSync(distNodeModules, { recursive: true, force: true });
  console.log("[postbuild] Removed dist/node_modules (no longer needed)");
}

writeFileSync(mainJsPath, content);
console.log("[postbuild] Complete.");
