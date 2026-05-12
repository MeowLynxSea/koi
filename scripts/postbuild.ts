/**
 * Post-build script to fix native module paths in the bundle.
 *
 * This script:
 * 1. Copies ALL platform-specific native libraries to native/ directory
 * 2. Patches the bundle to use absolute paths for native modules
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

const nativeDir = join(rootDir, "native");

// Copy native libraries for ALL platforms
console.log("[postbuild] Copying native libraries for all platforms...");

// Copy @opentui/core native libraries
const opentuiNativeDir = join(nativeDir, "opentui");
for (const { platform, arch } of platforms) {
  const platformModule = `@opentui/core-${platform}-${arch}`;
  const platformModulePath = join(nodeModulesDir, platformModule);
  const nativeLibExt = getNativeLibExt(platform);
  const nativeLibName = `libopentui${nativeLibExt}`;
  const srcPath = join(platformModulePath, nativeLibName);
  const destDir = join(opentuiNativeDir, platform, arch);
  const destPath = join(destDir, nativeLibName);

  if (existsSync(srcPath)) {
    mkdirSync(destDir, { recursive: true });
    cpSync(srcPath, destPath);
    console.log(`[postbuild]   opentui/${platform}-${arch}: ${nativeLibName}`);
  }
}

// Copy onnxruntime native libraries
const onnxNativeDir = join(nativeDir, "onnx");
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
    console.log(`[postbuild]   onnx/${platform}-${arch}: ${files.join(", ")}`);
  }
}

let content = readFileSync(mainJsPath, "utf-8");

// Add initialization code at the very beginning of the file
// This defines paths to native libraries based on the current platform
const initCode = `
// KOI native module initialization
var __KOI_NATIVE_BASE__;
var __KOI_OPENTUI_PATH__;
var __KOI_ONNX_PATH__;
(function() {
  var _p = process.platform === 'win32' ? 'win32' : process.platform;
  var _a = process.arch;
  var _r = process.cwd();
  var _koiNativeBase = _r + '/native';
  __KOI_NATIVE_BASE__ = _koiNativeBase;
  __KOI_OPENTUI_PATH__ = _koiNativeBase + '/opentui/' + _p + '/' + _a;
  __KOI_ONNX_PATH__ = _koiNativeBase + '/onnx/' + _p + '/' + _a;
})();
`;

if (!content.includes("__KOI_NATIVE_BASE__")) {
  // Insert after the first line/bang comment if present
  if (content.startsWith("#!")) {
    const firstNewline = content.indexOf("\n");
    content = content.slice(0, firstNewline + 1) + initCode + content.slice(firstNewline + 1);
  } else {
    content = initCode + content;
  }
  console.log("[postbuild] Added native module initialization code");
}

// Replace OpenTUI dynamic import
// Original: var module = await import(`@opentui/core-${process.platform}-${process.arch}/index.js`);
const opentuiImportPattern = /var module = await import\(`@opentui\/core-[^`]+`\)/g;
const opentuiLibName = getNativeLibExt(process.platform);
const opentuiReplacement = `var module = { default: __KOI_OPENTUI_PATH__ + "/libopentui${opentuiLibName}" };`;

if (opentuiImportPattern.test(content)) {
  const matches = content.match(opentuiImportPattern);
  if (matches) {
    content = content.replace(opentuiImportPattern, opentuiReplacement);
    console.log(`[postbuild] Replaced ${matches.length} OpenTUI dynamic import(s)`);
  }
}

// Replace onnxruntime path
// Original: __require(`../bin/napi-v3/${process.platform}/${process.arch}/file.node`)
const onnxPattern = /`\.\.\/bin\/napi-v3\/\$\{process\.platform\}\/\$\{process\.arch\}\/([^`]+)`/g;
const onnxReplacement = `__KOI_ONNX_PATH__ + "/$1"`;

if (onnxPattern.test(content)) {
  const matches = content.match(onnxPattern);
  if (matches) {
    content = content.replace(onnxPattern, onnxReplacement);
    console.log(`[postbuild] Replaced ${matches.length} onnxruntime path(s)`);
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
