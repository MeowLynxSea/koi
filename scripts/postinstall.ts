/**
 * Post-install script for koi.
 *
 * This script runs after `bun install` to ensure the platform-specific
 * native modules for @opentui/core are properly installed.
 *
 * The actual native library resolution and bundling is handled
 * in scripts/postbuild.ts during the build process.
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const nodeModulesDir = join(rootDir, "node_modules");

const platform = process.platform === "win32" ? "win32" : process.platform;
const arch = process.arch;
const platformModule = `@opentui/core-${platform}-${arch}`;
const platformModulePath = join(nodeModulesDir, platformModule);

console.log(`[postinstall] Detected platform: ${platform}-${arch}`);

// Check if the platform module exists
if (!existsSync(platformModulePath)) {
  console.warn(`[postinstall] Warning: ${platformModule} not found.`);
  console.warn(`[postinstall] This native module may need to be installed separately.`);
  console.warn(`[postinstall] Try running: bun add ${platformModule}`);
  process.exit(0);
}

console.log(`[postinstall] ${platformModule} is ready.`);
console.log("[postinstall] Build the project with 'bun run build' to include native modules.");
