/**
 * Post-install script to fix @opentui/core platform-specific modules.
 *
 * @opentui/core-darwin-arm64 and similar packages use .ts files as entry points,
 * but bun bundler cannot resolve dynamic .ts imports in bundled output.
 * This script creates .js files that can be resolved at runtime.
 * It also ensures all platform-specific packages are installed (not just the current platform).
 */

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Platform-specific modules that need .js shims and installation
const platformModules = [
  "@opentui/core-darwin-arm64",
  "@opentui/core-darwin-x64",
  "@opentui/core-linux-arm64",
  "@opentui/core-linux-x64",
  "@opentui/core-win32-arm64",
  "@opentui/core-win32-x64",
];

// Platform modules installation is now handled by the installer scripts
// to avoid infinite recursion when using bun add in postinstall
// This script creates shim files AND copies platform modules to dist/node_modules

import { mkdirSync, cpSync } from "fs";

const indexJsContent = `const module = await import("./libopentui.dylib", { with: { type: "file" } });
export default module.default;
`;

const indexJsWinContent = `const module = await import("./libopentui.dll", { with: { type: "file" } });
export default module.default;
`;

for (const moduleName of platformModules) {
  const modulePath = join(rootDir, "node_modules", moduleName);
  if (!existsSync(modulePath)) continue;

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
  if (!existsSync(distNodeModules)) {
    mkdirSync(dirname(distNodeModules), { recursive: true });
    cpSync(modulePath, distNodeModules, { recursive: true });
    console.log(`Copied ${moduleName} to dist/node_modules/`);
  }
}

// Fix @opentui/core's dynamic import to use .js instead of .ts
const opentuiCorePath = join(rootDir, "node_modules", "@opentui", "core");
const indexHmk8xzt3Path = join(opentuiCorePath, "index-hmk8xzt3.js");

if (existsSync(indexHmk8xzt3Path)) {
  let content = readFileSync(indexHmk8xzt3Path, "utf-8");
  if (content.includes("/index.ts")) {
    content = content.replace(/\/index\.ts/g, "/index.js");
    writeFileSync(indexHmk8xzt3Path, content);
    console.log("Fixed @opentui/core/index-hmk8xzt3.js dynamic import");
  }
}

console.log("Postinstall complete.");
