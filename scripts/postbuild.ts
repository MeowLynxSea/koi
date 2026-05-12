/**
 * Post-build script to fix native module paths in the bundle.
 *
 * This script:
 * 1. Copies ALL platform-specific native libraries to native/ directory
 * 2. Replaces the dynamic import in @opentui/core with runtime platform detection
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
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const mainJsPath = join(distDir, "main.js");

if (!existsSync(mainJsPath)) {
  console.log("dist/main.js not found, skipping postbuild...");
  process.exit(0);
}

const nodeModulesDir = join(rootDir, "node_modules");

// All supported platforms
const platforms = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "linux", arch: "arm64" },
  { platform: "linux", arch: "x64" },
  { platform: "win32", arch: "arm64" },
  { platform: "win32", arch: "x64" },
];

// Detect native library extension for each platform
function getNativeLibExt(platform: string): string {
  switch (platform) {
    case "darwin":
      return ".dylib";
    case "win32":
      return ".dll";
    default:
      return ".so";
  }
}

const nativeDir = join(rootDir, "native", "opentui");

// Copy native libraries for ALL platforms
console.log("[postbuild] Copying native libraries for all platforms...");
for (const { platform, arch } of platforms) {
  const platformModule = `@opentui/core-${platform}-${arch}`;
  const platformModulePath = join(nodeModulesDir, platformModule);
  const nativeLibExt = getNativeLibExt(platform);
  const nativeLibName = `libopentui${nativeLibExt}`;
  const srcPath = join(platformModulePath, nativeLibName);
  const destDir = join(nativeDir, platform, arch);
  const destPath = join(destDir, nativeLibName);

  if (existsSync(srcPath)) {
    mkdirSync(destDir, { recursive: true });
    cpSync(srcPath, destPath);
    console.log(`[postbuild]   ${platform}-${arch}: ${nativeLibName}`);
  } else {
    console.warn(`[postbuild]   ${platform}-${arch}: NOT FOUND (skipping)`);
  }
}

let content = readFileSync(mainJsPath, "utf-8");

// Replace the dynamic import with a runtime platform resolver
// Original: var module = await import(`@opentui/core-${process.platform}-${process.arch}/index.js`);
// Replace with: a function that resolves the correct native lib path at runtime

const dynamicImportPattern = /var module = await import\(`@opentui\/core-\$\{process\.platform\}-\$\{process\.arch\}\/index\.js`\);?/g;

// Create a runtime path resolver function
const runtimeResolver = `// Runtime resolver for OpenTUI native library
var _opentuiNativePath = (function() {
  var base = import.meta.dirname || (typeof __dirname !== 'undefined' ? __dirname : '.');
  // Navigate from dist/main.js to native/opentui/{platform}/{arch}/
  var plat = process.platform === 'win32' ? 'win32' : process.platform;
  var arch2 = process.arch;
  // Go up from dist/ to project root, then into native/opentui
  var parts = base.split(/[\\\\/]/);
  var idx = parts.lastIndexOf('dist');
  var root = idx > 0 ? parts.slice(0, idx).join('/') : base;
  var libName = plat === 'win32' ? 'libopentui.dll' : (plat === 'darwin' ? 'libopentui.dylib' : 'libopentui.so');
  return root + '/native/opentui/' + plat + '/' + arch2 + '/' + libName;
})();
var module = { default: _opentuiNativePath };`;

if (content.includes("@opentui/core-")) {
  const matches = content.match(dynamicImportPattern);
  if (matches) {
    content = content.replace(dynamicImportPattern, runtimeResolver);
    console.log(`[postbuild] Replaced ${matches.length} dynamic import(s) with runtime resolver`);
  }
}

// Fix onnxruntime-node path - use same runtime resolver pattern
if (content.includes("../bin/napi-v3/")) {
  // Replace the relative path with runtime-resolved path
  // Note: Use a simpler approach - just replace the directory prefix
  content = content.replace(
    /\.\.\/bin\/napi-v3\//g,
    `__KOI_NATIVE_ONNX__/`
  );

  // Add a header that defines __KOI_NATIVE_ONNX__ based on runtime platform
  // Find a good insertion point (after the first var declarations)
  const onnxPathResolver = `
var __KOI_NATIVE_ONNX__ = (function() {
  var p = process.platform === 'win32' ? 'win32' : process.platform;
  var a = process.arch;
  var base = typeof import !== 'undefined' && import.meta && import.meta.dirname ? import.meta.dirname : (typeof __dirname !== 'undefined' ? __dirname : '.');
  var parts = base.split(/[\\\\/]/);
  var idx = parts.lastIndexOf('dist');
  var root = idx > 0 ? parts.slice(0, idx).join('/') : base;
  return root + '/native/onnx/' + p + '/' + a;
})();
`;

  // Insert after the first "var " declaration
  content = content.replace(/(var \w+ = [^;]+;[\s\n]*)/, `$1${onnxPathResolver}`);
  console.log("[postbuild] Fixed onnxruntime-node native module path");
}

// Copy onnxruntime native libraries for ALL platforms
const onnxNativeDir = join(rootDir, "native", "onnx");
console.log("[postbuild] Copying onnxruntime native libraries for all platforms...");
for (const { platform, arch } of platforms) {
  const onnxSrcDir = join(nodeModulesDir, "onnxruntime-node", "bin", "napi-v3", platform, arch);
  const onnxDestDir = join(onnxNativeDir, platform, arch);

  if (existsSync(onnxSrcDir)) {
    const files = readdirSync(onnxSrcDir);
    mkdirSync(onnxDestDir, { recursive: true });
    for (const file of files) {
      cpSync(join(onnxSrcDir, file), join(onnxDestDir, file));
    }
    console.log(`[postbuild]   ${platform}-${arch}: ${files.join(", ")}`);
  }
}

// Clean up dist/node_modules (if it exists from old builds)
const distNodeModules = join(distDir, "node_modules");
if (existsSync(distNodeModules)) {
  rmSync(distNodeModules, { recursive: true, force: true });
  console.log("[postbuild] Removed dist/node_modules");
}

writeFileSync(mainJsPath, content);
console.log("[postbuild] Complete.");
