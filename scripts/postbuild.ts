/**
 * Post-build script to fix native module paths in the bundle.
 *
 * Downloads all platform-specific opentui native libraries from GitHub releases
 * and patches the bundle to use the correct paths.
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
import { execSync } from "child_process";

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

// Detect OS name for GitHub releases
function getOsName(platform: string): string {
  switch (platform) {
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      return platform;
  }
}

const nativeDir = join(rootDir, "native");
const opentuiNativeDir = join(nativeDir, "opentui");

// Download opentui native libraries
console.log("[postbuild] Copying/Downloading opentui native libraries...");
for (const { platform, arch } of platforms) {
  const destDir = join(opentuiNativeDir, platform, arch);
  mkdirSync(destDir, { recursive: true });

  const nativeLibExt = getNativeLibExt(platform);
  const nativeLibName = `libopentui${nativeLibExt}`;
  const destPath = join(destDir, nativeLibName);

  // Check if already exists
  if (existsSync(destPath)) {
    console.log(`[postbuild]   opentui/${platform}-${arch}: ${nativeLibName} (exists)`);
    continue;
  }

  // Try to copy from node_modules first
  const platformModule = `@opentui/core-${platform}-${arch}`;
  const srcPath = join(nodeModulesDir, platformModule, nativeLibName);

  if (existsSync(srcPath)) {
    cpSync(srcPath, destPath);
    console.log(`[postbuild]   opentui/${platform}-${arch}: ${nativeLibName} (from node_modules)`);
    continue;
  }

  // Download from GitHub releases
  const osName = getOsName(platform);
  const zipName = `opentui-native-v0.2.7-${osName}-${arch}.zip`;
  const downloadUrl = `https://github.com/anomalyco/opentui/releases/download/v0.2.7/${zipName}`;
  console.log(`[postbuild]   opentui/${platform}-${arch}: downloading...`);

  const os = require("os");
  const tmpDir = join(os.tmpdir(), `koi-download-${Date.now()}`);
  const zipPath = join(tmpDir, zipName);
  const extractDir = join(tmpDir, "extracted");

  try {
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(extractDir, { recursive: true });

    // Download using curl
    execSync(`curl -sL "${downloadUrl}" -o "${zipPath}"`, { stdio: "pipe" });

    if (existsSync(zipPath)) {
      // Extract - use unzip for all zip files (works on Linux/Mac, unzip is available on GitHub runners)
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

      // Find and copy the library
      const files = readdirSync(extractDir);
      for (const f of files) {
        // Windows: opentui.dll, others: libopentui.so/dylib
        if (f.startsWith("libopentui") || f.startsWith("opentui")) {
          cpSync(join(extractDir, f), destPath);
          console.log(`[postbuild]   opentui/${platform}-${arch}: ${f} (downloaded)`);
          break;
        }
      }
    } else {
      console.log(`[postbuild]   opentui/${platform}-${arch}: download failed`);
    }
  } catch (e) {
    console.log(`[postbuild]   opentui/${platform}-${arch}: failed - ${(e as Error).message}`);
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Copy onnxruntime native libraries from node_modules
const onnxNativeDir = join(nativeDir, "onnx");
console.log("[postbuild] Copying onnxruntime native libraries...");
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
const initCode = `
// KOI native module initialization
var __KOI_NATIVE_BASE__;
var __KOI_OPENTUI_PATH__;
var __KOI_ONNX_PATH__;
var __KOI_OPENTUI_EXT__;
(function() {
  var _p = process.platform === 'win32' ? 'win32' : process.platform;
  var _a = process.arch;
  var _r = process.env.KOI_PACKAGE_ROOT || process.cwd();
  var _koiNativeBase = _r + '/native';
  __KOI_NATIVE_BASE__ = _koiNativeBase;
  __KOI_OPENTUI_PATH__ = _koiNativeBase + '/opentui/' + _p + '/' + _a;
  __KOI_ONNX_PATH__ = _koiNativeBase + '/onnx/' + _p + '/' + _a;
  // Detect opentui extension: .dll (win32), .dylib (darwin), .so (linux)
  __KOI_OPENTUI_EXT__ = _p === 'win32' ? '.dll' : (_p === 'darwin' ? '.dylib' : '.so');
})();
`;

if (!content.includes("__KOI_NATIVE_BASE__")) {
  if (content.startsWith("#!")) {
    const firstNewline = content.indexOf("\n");
    content = content.slice(0, firstNewline + 1) + initCode + content.slice(firstNewline + 1);
  } else {
    content = initCode + content;
  }
  console.log("[postbuild] Added native module initialization code");
}

// Replace OpenTUI dynamic import - use runtime extension detection
const opentuiImportPattern = /var module = await import\(`@opentui\/core-[^`]+`\)/g;
const opentuiReplacement = `var module = { default: __KOI_OPENTUI_PATH__ + "/libopentui" + __KOI_OPENTUI_EXT__ };`;

if (opentuiImportPattern.test(content)) {
  const matches = content.match(opentuiImportPattern);
  if (matches) {
    content = content.replace(opentuiImportPattern, opentuiReplacement);
    console.log(`[postbuild] Replaced ${matches.length} OpenTUI dynamic import(s)`);
  }
}

// Replace onnxruntime path
const onnxPattern = /`\.\.\/bin\/napi-v3\/\$\{process\.platform\}\/\$\{process\.arch\}\/([^`]+)`/g;
const onnxReplacement = `__KOI_ONNX_PATH__ + "/$1"`;

if (onnxPattern.test(content)) {
  const matches = content.match(onnxPattern);
  if (matches) {
    content = content.replace(onnxPattern, onnxReplacement);
    console.log(`[postbuild] Replaced ${matches.length} onnxruntime path(s)`);
  }
}

// Clean up dist/node_modules
const distNodeModules = join(distDir, "node_modules");
if (existsSync(distNodeModules)) {
  rmSync(distNodeModules, { recursive: true, force: true });
  console.log("[postbuild] Removed dist/node_modules");
}

writeFileSync(mainJsPath, content);
console.log("[postbuild] Complete.");
