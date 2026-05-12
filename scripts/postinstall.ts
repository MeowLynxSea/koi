/**
 * Post-install script to fix @opentui/core platform-specific modules.
 */

import { existsSync, writeFileSync, readFileSync, mkdirSync, cpSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

console.log(`[DEBUG] __dirname: ${__dirname}`);
console.log(`[DEBUG] rootDir: ${rootDir}`);
console.log(`[DEBUG] process.cwd(): ${process.cwd()}`);
console.log(`[DEBUG] process.platform: ${process.platform}`);
console.log(`[DEBUG] process.arch: ${process.arch}`);

// Platform-specific modules that need .js shims and installation
const platformModules = [
  "@opentui/core-darwin-arm64",
  "@opentui/core-darwin-x64",
  "@opentui/core-linux-arm64",
  "@opentui/core-linux-x64",
  "@opentui/core-win32-arm64",
  "@opentui/core-win32-x64",
];

const indexJsContent = `const module = await import("./libopentui.dylib", { with: { type: "file" } });
export default module.default;
`;

const indexJsWinContent = `const module = await import("./opentui.dll", { with: { type: "file" } });
export default module.default;
`;

// Find the actual node_modules path
// In global install, koi is at: C:\Users\Acro\node_modules\@meowlynxsea\koi
// Platform modules are at: C:\Users\Acro\node_modules\@opentui\core-win32-x64
// rootDir is: C:\Users\Acro\node_modules\@meowlynxsea\koi
// dirname(rootDir) is: C:\Users\Acro\node_modules\@meowlynxsea (WRONG)
// We need to go up two levels to get: C:\Users\Acro\node_modules
const parentDir = dirname(dirname(rootDir));
console.log(`[DEBUG] parentDir (dirname(dirname(rootDir))): ${parentDir}`);

// Check if parentDir has the expected structure
const parentNodeModulesCheck = join(parentDir, "@opentui");
console.log(`[DEBUG] Checking if ${parentNodeModulesCheck} exists: ${existsSync(parentNodeModulesCheck)}`);

for (const moduleName of platformModules) {
  const modulePath = join(parentDir, moduleName);
  
  console.log(`\n[DEBUG] === Processing ${moduleName} ===`);
  console.log(`[DEBUG] modulePath: ${modulePath}`);
  console.log(`[DEBUG] existsSync(modulePath): ${existsSync(modulePath)}`);
  
  if (!existsSync(modulePath)) {
    console.log(`[DEBUG] Skipping ${moduleName} - not found`);
    continue;
  }

  const indexJsPath = join(modulePath, "index.js");
  const packageJsonPath = join(modulePath, "package.json");

  // Create index.js if it doesn't exist
  if (!existsSync(indexJsPath)) {
    const content = moduleName.includes("win32")
      ? indexJsWinContent
      : indexJsContent;
    writeFileSync(indexJsPath, content);
    console.log(`Created ${moduleName}/index.js`);
  }

  // Update package.json main field to point to .js
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    if (pkg.main === "index.ts") {
      pkg.main = "index.js";
      pkg.module = "index.js";
      writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`Updated ${moduleName}/package.json`);
    }
  }

  // Copy platform module to dist/node_modules for proper module resolution
  const distNodeModules = join(rootDir, "dist", "node_modules", moduleName);
  console.log(`[DEBUG] distNodeModules: ${distNodeModules}`);
  
  if (!existsSync(distNodeModules)) {
    const distDir = join(rootDir, "dist", "node_modules");
    console.log(`[DEBUG] Creating ${distDir}`);
    mkdirSync(distDir, { recursive: true });
    
    console.log(`[DEBUG] Copying ${modulePath} -> ${distNodeModules}`);
    cpSync(modulePath, distNodeModules, { recursive: true });
    console.log(`Copied ${moduleName} to dist/node_modules/`);
  } else {
    console.log(`[DEBUG] ${distNodeModules} already exists, skipping copy`);
  }
}

// Fix @opentui/core's dynamic import to use .js instead of .ts
const opentuiCorePath = join(parentDir, "@opentui", "core");
const indexHmk8xzt3Path = join(opentuiCorePath, "index-hmk8xzt3.js");

console.log(`\n[DEBUG] Checking for opentui core fix:`);
console.log(`[DEBUG] opentuiCorePath: ${opentuiCorePath}`);
console.log(`[DEBUG] indexHmk8xzt3Path: ${indexHmk8xzt3Path}`);
console.log(`[DEBUG] existsSync(indexHmk8xzt3Path): ${existsSync(indexHmk8xzt3Path)}`);

if (existsSync(indexHmk8xzt3Path)) {
  let content = readFileSync(indexHmk8xzt3Path, "utf-8");
  if (content.includes("/index.ts")) {
    content = content.replace(/\/index\.ts/g, "/index.js");
    writeFileSync(indexHmk8xzt3Path, content);
    console.log("Fixed @opentui/core/index-hmk8xzt3.js dynamic import");
  }
}

console.log("\nPostinstall complete.");

// Fix main.js: replace scoped package imports with relative paths for Windows compatibility
const mainJsPath = join(rootDir, "dist", "main.js");
if (existsSync(mainJsPath)) {
  let content = readFileSync(mainJsPath, "utf-8");
  let modified = false;
  
  // Replace: import(`@opentui/core-${platform}-${arch}/index.js`)
  // With:    import(`./node_modules/@opentui/core-${platform}-${arch}/index.js`)
  if (content.includes("`@opentui/core-")) {
    content = content.replace(/`@opentui\/core-/g, "`./node_modules/@opentui/core-");
    modified = true;
  }
  
  // Copy onnxruntime native modules for the current platform
  // Source: parentDir/onnxruntime-node/bin/napi-v3/{os}/{arch}/*
  // Dest:   rootDir/dist/onnx-bin/napi-v3/{os}/{arch}/*
  const onnxSrcDir = join(parentDir, "onnxruntime-node", "bin", "napi-v3", process.platform, process.arch);
  const onnxDestDir = join(rootDir, "dist", "onnx-bin", "napi-v3", process.platform, process.arch);
  
  if (existsSync(onnxSrcDir)) {
    const files = readdirSync(onnxSrcDir);
    for (const file of files) {
      const src = join(onnxSrcDir, file);
      const dest = join(onnxDestDir, file);
      if (!existsSync(dest)) {
        mkdirSync(onnxDestDir, { recursive: true });
        cpSync(src, dest);
        console.log(`Copied onnxruntime: ${file}`);
      }
    }
  } else {
    console.log(`[DEBUG] onnxruntime source not found: ${onnxSrcDir}`);
  }
  
  if (modified) {
    writeFileSync(mainJsPath, content);
    console.log("Fixed dynamic imports in main.js for Windows compatibility");
  }
}
