// 版本号统一从 package.json 读取
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
  version: string;
}

function getVersion(): string {
  try {
    const packageJsonPath = resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
    return `v${packageJson.version}`;
  } catch {
    return "v0.0.0";
  }
}

export const VERSION = getVersion();
