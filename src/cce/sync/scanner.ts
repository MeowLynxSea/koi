/**
 * Project file scanner.
 *
 * Walks the project tree, extracts signatures, TODO/FIXME markers,
 * detects language, computes content hash.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Glob } from "bun";

export interface TaskMarker {
  kind: "TODO" | "FIXME" | "HACK" | "NOTE" | "XXX";
  text: string;
  line: number;
}

export interface ScannedFile {
  path: string;
  rel_path: string;
  language: string;
  size_bytes: number;
  content_hash: string;
  signatures: string;
  tasks: TaskMarker[];
  content_preview: string;
  content: string;
}

const BINARY_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".obj",
  ".a", ".lib", ".pdb", ".ilk", ".class", ".jar", ".war",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".svg",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".db", ".sqlite", ".sqlite3", ".lock", ".pid", ".sock",
  ".pyc", ".pyo", ".egg", ".whl",
]);

const IGNORED_DIR_PARTS = new Set([
  ".git", "__pycache__", ".venv", "venv", "node_modules",
  "dist", "build", ".cce", ".idea", ".vscode", ".pytest_cache",
  ".mypy_cache", ".tox", ".eggs", ".coverage", "htmlcov",
  "target", ".gradle", "bin", "obj", ".gitignore",
]);

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
    ".py": "python", ".rs": "rust", ".go": "go",
    ".java": "java", ".kt": "kotlin", ".scala": "scala",
    ".c": "c", ".cpp": "cpp", ".cc": "cpp", ".h": "c", ".hpp": "cpp",
    ".cs": "csharp", ".fs": "fsharp",
    ".rb": "ruby", ".php": "php", ".swift": "swift",
    ".sh": "bash", ".zsh": "bash", ".fish": "fish",
    ".md": "markdown", ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".ini": "ini", ".cfg": "ini",
    ".html": "html", ".css": "css", ".scss": "scss", ".less": "less",
    ".sql": "sql", ".dockerfile": "dockerfile",
    ".vue": "vue", ".svelte": "svelte",
  };
  return map[ext] || "unknown";
}

function isBinaryFile(filePath: string, sampleBytes = 8192): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(sampleBytes);
    const bytesRead = fs.readSync(fd, buf, 0, sampleBytes, 0);
    fs.closeSync(fd);
    const chunk = buf.subarray(0, bytesRead);
    if (chunk.includes(0)) return true;
    const textChars = new Set([7, 8, 9, 10, 12, 13, 27, ...Array.from({ length: 224 }, (_, i) => i + 32)]);
    const nonText = chunk.filter((b) => !textChars.has(b)).length;
    return chunk.length > 0 && nonText / chunk.length > 0.3;
  } catch {
    return true;
  }
}

function shouldIgnore(relPath: string, filePath: string): boolean {
  const parts = relPath.split(path.sep);
  if (parts.some((p) => IGNORED_DIR_PARTS.has(p))) return true;
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > 2 * 1024 * 1024) return true;
  } catch {
    return true;
  }
  if (isBinaryFile(filePath)) return true;
  return false;
}

export function extractSignatures(content: string, language: string): string {
  const lines: string[] = [];
  const allLines = content.split("\n");

  if (["typescript", "javascript", "java", "csharp", "kotlin", "go", "rust", "swift", "scala"].includes(language)) {
    for (const line of allLines) {
      const trimmed = line.trim();
      if (/^(export\s+)?(async\s+)?(function|class|interface|type|enum|struct|impl|fn|func|def)\s+\w/.test(trimmed)) {
        lines.push(trimmed);
      } else if (/^(public|private|protected|static|virtual|override|abstract)\s+/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  } else if (language === "python") {
    for (const line of allLines) {
      const trimmed = line.trim();
      if (/^(async\s+)?def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  } else if (language === "c" || language === "cpp") {
    for (const line of allLines) {
      const trimmed = line.trim();
      if (/^\w+\s+\w+\s*\(/.test(trimmed) || /^struct\s+\w+/.test(trimmed) || /^typedef\s+/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  } else if (language === "ruby") {
    for (const line of allLines) {
      const trimmed = line.trim();
      if (/^def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed) || /^module\s+\w/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  }

  return lines.slice(0, 30).join("\n");
}

export function extractTasks(content: string, _relPath: string): TaskMarker[] {
  const tasks: TaskMarker[] = [];
  const lines = content.split("\n");
  const re = /(TODO|FIXME|HACK|NOTE|XXX)[\s:]*(.*)/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(re);
    if (m) {
      tasks.push({
        kind: m[1]!.toUpperCase() as TaskMarker["kind"],
        text: m[2]!.trim(),
        line: i + 1,
      });
    }
  }
  return tasks;
}

export function scanProject(
  projectRoot: string,
  include?: string[],
  exclude?: string[]
): ScannedFile[] {
  const patterns = include && include.length > 0 ? include : ["**/*"];
  const results: ScannedFile[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for (const file of glob.scanSync({ cwd: projectRoot, absolute: false, onlyFiles: true })) {
      const filePath = path.join(projectRoot, file);
      const relPath = file.replace(/\\/g, "/");

      if (shouldIgnore(relPath, filePath)) continue;
      if (exclude && exclude.some((p) => relPath.includes(p) || relPath.startsWith(p))) continue;

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const language = detectLanguage(filePath);
        const signatures = extractSignatures(content, language);
        const tasks = extractTasks(content, relPath);
        const contentHash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);

        results.push({
          path: filePath,
          rel_path: relPath,
          language,
          size_bytes: content.length,
          content_hash: contentHash,
          signatures,
          tasks,
          content_preview: content.slice(0, 500),
          content,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  return results;
}
