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
  const zipName = `opentui-native-v0.3.0-${osName}-${arch}.zip`;
  const downloadUrl = `https://github.com/anomalyco/opentui/releases/download/v0.3.0/${zipName}`;
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
      // Extract - use unzip for all zip files
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

// Copy clipboard native bindings for all platforms
const clipboardNativeDir = join(nativeDir, "clipboard");
console.log("[postbuild] Copying clipboard native bindings...");
const clipboardPlatformSuffixes: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-universal",
  "linux-arm64": "linux-arm64-gnu",
  "linux-x64": "linux-x64-gnu",
  "win32-arm64": "win32-arm64-msvc",
  "win32-x64": "win32-x64-msvc",
};
const clipboardOs = require("os");
const clipboardTmpDir = join(clipboardOs.tmpdir(), `koi-clipboard-${Date.now()}`);

for (const { platform, arch } of platforms) {
  const suffix = clipboardPlatformSuffixes[`${platform}-${arch}`];
  const clipboardPkg = `@mariozechner/clipboard-${suffix}`;
  const clipboardPkgPath = join(nodeModulesDir, clipboardPkg);
  const destDir = join(clipboardNativeDir, platform, arch);
  mkdirSync(destDir, { recursive: true });

  if (existsSync(clipboardPkgPath)) {
    // Copy from node_modules
    const pkgFiles = readdirSync(clipboardPkgPath);
    const nodeFiles = pkgFiles.filter(f => f.endsWith(".node"));
    if (nodeFiles.length > 0) {
      for (const file of nodeFiles) {
        cpSync(join(clipboardPkgPath, file), join(destDir, file));
      }
      console.log(`[postbuild]   clipboard/${platform}-${arch}: ${nodeFiles.join(", ")} (from node_modules)`);
    }
  } else {
    // Download from npm
    console.log(`[postbuild]   clipboard/${platform}-${arch}: downloading ${clipboardPkg}...`);
    const pkgTmpDir = join(clipboardTmpDir, clipboardPkg.replace("/", "_"));
    try {
      execSync(`npm pack ${clipboardPkg} --pack-destination "${pkgTmpDir}"`, { stdio: "pipe" });
      const tarball = readdirSync(pkgTmpDir).find(f => f.endsWith(".tgz"));
      if (tarball) {
        execSync(`tar -xzf "${join(pkgTmpDir, tarball)}" -C "${pkgTmpDir}"`, { stdio: "pipe" });
        const packageDir = join(pkgTmpDir, "package");
        if (existsSync(packageDir)) {
          const pkgFiles = readdirSync(packageDir);
          const nodeFiles = pkgFiles.filter(f => f.endsWith(".node"));
          for (const file of nodeFiles) {
            cpSync(join(packageDir, file), join(destDir, file));
          }
          console.log(`[postbuild]   clipboard/${platform}-${arch}: ${nodeFiles.join(", ")} (downloaded)`);
        }
      }
    } catch (e) {
      console.log(`[postbuild]   clipboard/${platform}-${arch}: download failed - ${(e as Error).message}`);
    }
  }
}

// Cleanup
try { rmSync(clipboardTmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

let content = readFileSync(mainJsPath, "utf-8");

// Add initialization code at the very beginning of the file
const initCode = `
// KOI native module initialization
var __KOI_NATIVE_BASE__;
var __KOI_OPENTUI_PATH__;
var __KOI_ONNX_PATH__;
var __KOI_OPENTUI_EXT__;
var __KOI_CLIPBOARD_PATH__;
(function() {
  var _p = process.platform === 'win32' ? 'win32' : process.platform;
  var _a = process.arch;
  var _r = process.env.KOI_PACKAGE_ROOT || process.cwd();
  var _koiNativeBase = _r + '/native';
  __KOI_NATIVE_BASE__ = _koiNativeBase;
  __KOI_OPENTUI_PATH__ = _koiNativeBase + '/opentui/' + _p + '/' + _a;
  __KOI_ONNX_PATH__ = _koiNativeBase + '/onnx/' + _p + '/' + _a;
  __KOI_CLIPBOARD_PATH__ = _koiNativeBase + '/clipboard/' + _p + '/' + _a;
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
// OpenTUI 0.3.0: var nativePackage = await import(`@opentui/core-${process.platform}-${process.arch}`);
const opentuiImportPattern = /var nativePackage = await import\(`@opentui\/core-[^`]+`\);\n?/g;
const opentuiReplacement = `var nativePackage = { default: __KOI_OPENTUI_PATH__ + "/libopentui" + __KOI_OPENTUI_EXT__ };\n`;

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

// Replace clipboard NAPI require - redirect to __KOI_CLIPBOARD_PATH__
// Pattern: existsSync4(join35(__dirname, "clipboard.platform-arch.node"))
const clipboardExistsPattern = /existsSync4\(join35\(__dirname, "clipboard\.([^"]+)"\)\)/g;
if (clipboardExistsPattern.test(content)) {
  const matches = content.match(clipboardExistsPattern);
  if (matches) {
    content = content.replace(clipboardExistsPattern, `existsSync4(__KOI_CLIPBOARD_PATH__ + "/clipboard.$1")`);
    console.log(`[postbuild] Replaced clipboard existsSync paths`);
  }
}

// Replace clipboard require path
// Pattern: require("./clipboard.platform-arch.node")
const clipboardRequirePattern = /require\("\.\/clipboard\.([^"]+)"\)/g;
if (clipboardRequirePattern.test(content)) {
  const matches = content.match(clipboardRequirePattern);
  if (matches) {
    content = content.replace(clipboardRequirePattern, `require(__KOI_CLIPBOARD_PATH__ + "/clipboard.$1")`);
    console.log(`[postbuild] Replaced clipboard require paths`);
  }
}

// Replace "Cannot require module" IIFE - this is what Bun throws when local file exists
// Bun converts require() to throw Error IIFE when it can't find the file at bundle time
// We need to replace the entire IIFE with a proper __require() call
// Pattern: nativeBinding = (()=>{throw new Error("Cannot require module " + __KOI_CLIPBOARD_PATH__ + "/clipboard.xxx.node");})();
const clipboardIIFEPattern = /nativeBinding = \(\(\)=>\{throw new Error\("Cannot require module " \+ __KOI_CLIPBOARD_PATH__ \+ "\/clipboard\.([^"]+)"\);\}\)\(\);/g;
const clipboardIIFEMatches = content.match(clipboardIIFEPattern);
if (clipboardIIFEMatches) {
  content = content.replace(clipboardIIFEPattern, "nativeBinding = __require(__KOI_CLIPBOARD_PATH__ + \"/clipboard.$1\");");
  console.log(`[postbuild] Fixed ${clipboardIIFEMatches.length} clipboard IIFE require(s)`);
}

// Also handle the case where __KOI_CLIPBOARD_PATH__ isn't set yet (before initCode runs)
const clipboardIIFEAltPattern = /nativeBinding = \(\(\)=>\{throw new Error\("Cannot require module " \+ __dirname \+ "\/clipboard\.([^"]+)"\);\}\)\(\);/g;
const clipboardIIFEAltMatches = content.match(clipboardIIFEAltPattern);
if (clipboardIIFEAltMatches) {
  content = content.replace(clipboardIIFEAltPattern, "nativeBinding = __require(__KOI_CLIPBOARD_PATH__ + \"/clipboard.$1\");");
  console.log(`[postbuild] Fixed ${clipboardIIFEAltMatches.length} clipboard IIFE require(s) (alt pattern)`);
}

// Handle the case where native files don't exist during build (e.g., CI without native downloaded yet)
// Pattern: nativeBinding = (()=>{throw new Error("Cannot require module "+"./clipboard.xxx.node");})();
const clipboardIIFEDotPattern = /nativeBinding = \(\(\)=>\{throw new Error\("Cannot require module "\+"\.\/clipboard\.([^"]+)"\);\}\)\(\);/g;
const clipboardIIFEDotMatches = content.match(clipboardIIFEDotPattern);
if (clipboardIIFEDotMatches) {
  content = content.replace(clipboardIIFEDotPattern, "nativeBinding = __require(__KOI_CLIPBOARD_PATH__ + \"/clipboard.$1\");");
  console.log(`[postbuild] Fixed ${clipboardIIFEDotMatches.length} clipboard IIFE require(s) (dot pattern)`);
}

// Clean up dist/node_modules
const distNodeModules = join(distDir, "node_modules");
if (existsSync(distNodeModules)) {
  rmSync(distNodeModules, { recursive: true, force: true });
  console.log("[postbuild] Removed dist/node_modules");
}

writeFileSync(mainJsPath, content);
console.log("[postbuild] Complete.");
