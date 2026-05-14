// 版本号统一从 package.json 读取
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "url";

interface PackageJson {
  version: string;
}

function getVersion(): string {
  try {
    // import.meta.url 在 bun bundle 后指向 dist/ 目录
    // 向上 1 级到包根目录，然后找 package.json
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = resolve(currentDir, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
    return `v${packageJson.version}`;
  } catch {
    return "v0.0.0";
  }
}

export const VERSION = getVersion();
