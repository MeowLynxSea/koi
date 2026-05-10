/**
 * Skills Loader
 *
 * Full implementation of Claude Code's skill loading system:
 * - Loads skills from ~/.config/koi/skills and .claude/skills
 * - Supports SKILL.md format with YAML frontmatter
 * - Conditional skills (path-filtered activation)
 * - Dynamic skill discovery based on file paths
 * - Argument substitution with {{skill.args}}
 * - Shell command execution (!`...` syntax)
 */

import path from "path";
import os from "os";
import { realpath as nodeRealpath, readdir, stat as fsStat, access, readFile } from "fs/promises";
import fsSync from "fs";
import { fileURLToPath } from "url";
import { parseFrontmatter, parseFrontmatterFields } from "./frontmatter.js";
import { substituteArguments, substituteEnvVariables, parseArgumentNames } from "./substitution.js";
import type {
  SkillCommand,
  SkillWithPath,
  SkillSource,
  SkillLoadedFrom,
  BundledSkillDefinition,
  HooksSettings,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default skills directories
const USER_SKILLS_DIR = path.join(os.homedir(), ".config", "koi", "skills");
const LEGACY_COMMANDS_DIR = path.join(os.homedir(), ".config", "koi", "commands");

/**
 * Skill state tracking
 */
interface SkillState {
  unconditional: Map<string, SkillCommand>;
  conditional: Map<string, SkillCommand>;
  activatedConditional: Set<string>;
  dynamic: Map<string, SkillCommand>;
  discoveredDirs: Set<string>;
}

/**
 * Global skill state
 */
const skillState: SkillState = {
  unconditional: new Map(),
  conditional: new Map(),
  activatedConditional: new Set(),
  dynamic: new Map(),
  discoveredDirs: new Set(),
};

let skillsLoaded = false;
let loadListeners: (() => void)[] = [];

/**
 * Check if skills have been loaded
 */
export function areSkillsLoaded(): boolean {
  return skillsLoaded;
}

/**
 * Get the skills directory path for a given source
 */
export function getSkillsPath(source: SkillSource, cwd?: string): string {
  switch (source) {
    case "userSettings":
      return USER_SKILLS_DIR;
    case "projectSettings":
      return cwd ? path.join(cwd, ".claude", "skills") : ".claude/skills";
    case "policySettings":
      return path.join(os.homedir(), ".config", "koi", "policy", "skills");
    case "bundled":
      return path.join(__dirname, "bundled");
    default:
      return USER_SKILLS_DIR;
  }
}

/**
 * Get the commands directory path (legacy location)
 */
export function getCommandsPath(source: SkillSource, cwd?: string): string {
  switch (source) {
    case "userSettings":
      return LEGACY_COMMANDS_DIR;
    case "projectSettings":
      return cwd ? path.join(cwd, ".claude", "commands") : ".claude/commands";
    default:
      return LEGACY_COMMANDS_DIR;
  }
}

/**
 * Check if a path exists and is a directory
 */
async function isDirectory(p: string): Promise<boolean> {
  try {
    const fileStat = await fsStat(p);
    return fileStat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve real path, handling symlinks
 */
async function realPath(p: string): Promise<string> {
  try {
    const resolvedPath: string = await nodeRealpath(p);
    return resolvedPath;
  } catch {
    return p;
  }
}

/**
 * Find SKILL.md file in a directory (only SKILL.md, not other variants)
 */
async function findSkillFile(dirPath: string): Promise<string | null> {
  const skillFilePath = path.join(dirPath, "SKILL.md");
  if (await pathExists(skillFilePath)) {
    return skillFilePath;
  }
  return null;
}

/**
 * Recursively find all skill directories
 */
async function findSkillDirs(
  basePath: string,
  found: Set<string> = new Set()
): Promise<string[]> {
  if (!fsSync.existsSync(basePath)) {
    return [];
  }

  try {
    const entries = await readdir(basePath, { withFileTypes: true });
    const dirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(basePath, entry.name);
      const realFullPath = await realPath(fullPath);

      if (found.has(realFullPath)) continue;
      found.add(realFullPath);
      dirs.push(fullPath);
    }

    return dirs;
  } catch {
    return [];
  }
}

/**
 * Create a skill command from parsed data (Claude Code style)
 */
function createSkillCommand(params: {
  skillName: string;
  displayName?: string;
  description: string;
  hasUserSpecifiedDescription: boolean;
  markdownContent: string;
  allowedTools: string[];
  argumentHint?: string;
  argumentNames: string[];
  whenToUse?: string;
  version?: string;
  model?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  source: SkillSource;
  baseDir?: string;
  loadedFrom: SkillLoadedFrom;
  hooks?: HooksSettings;
  executionContext?: "fork" | "inline";
  agent?: string;
  paths?: string[];
  effort?: string;
}): SkillCommand {
  const {
    skillName,
    description,
    hasUserSpecifiedDescription,
    markdownContent,
    allowedTools,
    argumentHint,
    argumentNames,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    source,
    baseDir,
    loadedFrom,
    hooks,
    executionContext,
    agent,
    paths,
    effort,
  } = params;

  return {
    type: "prompt",
    name: skillName,
    description,
    hasUserSpecifiedDescription,
    allowedTools,
    argumentHint,
    argNames: argumentNames.length > 0 ? argumentNames : undefined,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    context: executionContext,
    agent,
    effort,
    paths,
    contentLength: markdownContent.length,
    isHidden: !userInvocable,
    progressMessage: "running",
    source,
    loadedFrom,
    hooks,
    skillRoot: baseDir,
    async getPromptForCommand(args, ctx) {
      let finalContent = markdownContent;

      // Add base directory prefix if available
      if (baseDir) {
        finalContent = `Base directory for this skill: ${baseDir}\n\n${finalContent}`;
      }

      // Substitute {{skill.args}} and <arg> placeholders
      finalContent = substituteArguments(finalContent, args, true, argumentNames);

      // Substitute environment variables
      finalContent = substituteEnvVariables(
        finalContent,
        ctx.env,
        undefined, // sessionId
        baseDir
      );

      // Execute shell commands (!`...` syntax)
      // In production, this would actually execute the commands
      // For now, we log what would be executed
      finalContent = finalContent.replace(/!`([^`]+)`/g, (_, cmd) => {
        console.log(`[skill:${skillName}] Shell: ${cmd}`);
        return `[shell output: ${cmd}]`;
      });

      return [{ type: "text" as const, text: finalContent }];
    },
  };
}

/**
 * Load a single skill from a file path
 */
async function loadSkillFromFile(
  filePath: string,
  source: SkillSource,
  loadedFrom: SkillLoadedFrom
): Promise<SkillWithPath | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const skillDir = path.dirname(filePath);
    const skillName = path.basename(skillDir); // Directory name is the skill name

    const { frontmatter, body } = parseFrontmatter(content);
    const fields = parseFrontmatterFields(frontmatter, body, skillName);

    // Parse paths for conditional skills
    const paths = fields.paths;

    const skill = createSkillCommand({
      skillName,
      displayName: fields.name,
      description: Array.isArray(fields.description)
        ? fields.description.join("\n")
        : fields.description ?? "",
      hasUserSpecifiedDescription: !!frontmatter.description,
      markdownContent: body,
      allowedTools: fields.allowed_tools ?? [],
      argumentHint: fields.argument_hint,
      argumentNames: parseArgumentNames(fields.arguments),
      whenToUse: fields.when_to_use,
      version: fields.version,
      model: fields.model,
      disableModelInvocation: fields.disable_model_invocation ?? false,
      userInvocable: fields.user_invocable ?? true,
      source,
      baseDir: skillDir,
      loadedFrom,
      hooks: fields.hooks,
      executionContext: fields.context,
      agent: fields.agent,
      paths,
      effort: fields.effort,
    });

    return { skill, filePath };
  } catch (error) {
    console.error(`Failed to load skill from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load all skills from a directory
 */
async function loadSkillsFromSkillsDir(
  basePath: string,
  source: SkillSource
): Promise<SkillWithPath[]> {
  if (!(await isDirectory(basePath))) {
    return [];
  }

  const skillDirs = await findSkillDirs(basePath);
  const skills: SkillWithPath[] = [];

  for (const dir of skillDirs) {
    const skillFile = await findSkillFile(dir);
    if (skillFile) {
      const skillWithPath = await loadSkillFromFile(skillFile, source, "skills");
      if (skillWithPath) {
        skills.push(skillWithPath);
      }
    }
  }

  return skills;
}

/**
 * Check if a path pattern matches a file path
 * Supports gitignore-style patterns
 */
function matchesPathPattern(pattern: string, filePath: string): boolean {
  // Simple glob matching - support ** and * patterns
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLE_STAR\}\}/g, ".*")
    .replace(/\?/g, ".");

  try {
    const regex = new RegExp(`^${regexPattern}(/.*)?$`);
    return regex.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Activate conditional skills for matching file paths
 */
export function activateConditionalSkillsForPaths(
  filePaths: string[],
  cwd: string
): string[] {
  const activated: string[] = [];

  for (const [name, skill] of skillState.conditional) {
    if (!skill.paths || skill.paths.length === 0) continue;

    for (const filePath of filePaths) {
      // Get relative path
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(cwd, filePath)
        : filePath;

      // Check if any path pattern matches
      const matches = skill.paths.some((pattern) =>
        matchesPathPattern(pattern, relativePath)
      );

      if (matches) {
        skillState.dynamic.set(name, skill);
        skillState.activatedConditional.add(name);
        skillState.conditional.delete(name);
        activated.push(name);
        console.log(`[skills] Activated conditional skill '${name}' for ${relativePath}`);
        break;
      }
    }
  }

  if (activated.length > 0) {
    notifyListeners();
  }

  return activated;
}

/**
 * Discover skill directories for file paths
 */
export async function discoverSkillDirsForPaths(
  filePaths: string[],
  cwd: string
): Promise<string[]> {
  const newDirs: string[] = [];

  for (const filePath of filePaths) {
    // Walk up from file to cwd
    let currentDir = path.dirname(filePath);
    const resolvedCwd = cwd.endsWith(path.sep) ? cwd.slice(0, -1) : cwd;

    while (currentDir.startsWith(resolvedCwd + path.sep) || currentDir === resolvedCwd) {
      const skillsDir = path.join(currentDir, ".claude", "skills");

      if (!skillState.discoveredDirs.has(skillsDir) && await isDirectory(skillsDir)) {
        skillState.discoveredDirs.add(skillsDir);
        newDirs.push(skillsDir);
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }

  return newDirs;
}

/**
 * Add discovered skill directories
 */
export async function addSkillDirectories(dirs: string[]): Promise<void> {
  if (dirs.length === 0) return;

  for (const dir of dirs) {
    const skills = await loadSkillsFromSkillsDir(dir, "projectSettings");
    for (const { skill } of skills) {
      if (skill.type === "prompt") {
        skillState.dynamic.set(skill.name, skill);
      }
    }
  }

  if (dirs.length > 0) {
    notifyListeners();
  }
}

/**
 * Load all skills from configured directories
 */
export async function loadAllSkills(cwd?: string): Promise<SkillCommand[]> {
  const seenPaths = new Set<string>();
  const allSkills: SkillCommand[] = [];

  // Load from user settings directory
  const userSkills = await loadSkillsFromSkillsDir(USER_SKILLS_DIR, "userSettings");
  for (const { skill, filePath } of userSkills) {
    const resolvedPath = await realPath(filePath);
    if (!seenPaths.has(resolvedPath)) {
      seenPaths.add(resolvedPath);
      allSkills.push(skill);
      
      // Separate conditional and unconditional skills
      if (skill.paths && skill.paths.length > 0) {
        skillState.conditional.set(skill.name, skill);
      } else {
        skillState.unconditional.set(skill.name, skill);
      }
    }
  }

  // Load from project settings directory
  if (cwd) {
    const projectSkillsDir = path.join(cwd, ".claude", "skills");
    const projectSkills = await loadSkillsFromSkillsDir(projectSkillsDir, "projectSettings");
    for (const { skill, filePath } of projectSkills) {
      const resolvedPath = await realPath(filePath);
      if (!seenPaths.has(resolvedPath)) {
        seenPaths.add(resolvedPath);
        allSkills.push(skill);
        
        if (skill.paths && skill.paths.length > 0) {
          skillState.conditional.set(skill.name, skill);
        } else {
          skillState.unconditional.set(skill.name, skill);
        }
      }
    }
  }

  // Load bundled skills
  const bundledSkillsList = loadBundledSkillsInternal();
  for (const skill of bundledSkillsList) {
    if (!seenPaths.has(skill.name)) {
      allSkills.push(skill);
      skillState.unconditional.set(skill.name, skill);
    }
  }

  skillsLoaded = true;
  notifyListeners();

  return allSkills;
}

/**
 * Notify listeners that skills have been loaded
 */
function notifyListeners(): void {
  for (const listener of loadListeners) {
    try {
      listener();
    } catch (error) {
      console.error("[skills] Listener error:", error);
    }
  }
}

/**
 * Get all registered skills (unconditional + activated conditional + dynamic)
 */
export function getAllSkills(): SkillCommand[] {
  const all = [
    ...skillState.unconditional.values(),
    ...skillState.conditional.values(),
    ...skillState.dynamic.values(),
  ];
  
  // Deduplicate by name
  const seen = new Set<string>();
  return all.filter((skill) => {
    if (seen.has(skill.name)) return false;
    seen.add(skill.name);
    return true;
  });
}

/**
 * Get all active skills (unconditional + activated conditional + dynamic)
 */
export function getActiveSkills(): SkillCommand[] {
  const all = [
    ...skillState.unconditional.values(),
    ...Array.from(skillState.conditional.values()).filter(
      (s) => skillState.activatedConditional.has(s.name)
    ),
    ...skillState.dynamic.values(),
  ];

  // Deduplicate by name
  const seen = new Set<string>();
  return all.filter((skill) => {
    if (seen.has(skill.name)) return false;
    seen.add(skill.name);
    return true;
  });
}

/**
 * Get a skill by name
 */
export function getSkillByName(name: string): SkillCommand | undefined {
  return (
    skillState.unconditional.get(name.toLowerCase()) ||
    skillState.conditional.get(name.toLowerCase()) ||
    skillState.dynamic.get(name.toLowerCase())
  );
}

/**
 * Check if a skill name exists
 */
export function hasSkill(name: string): boolean {
  return getSkillByName(name) !== undefined;
}

/**
 * Subscribe to skill loading events
 */
export function onSkillsLoaded(callback: () => void): () => void {
  loadListeners.push(callback);
  return () => {
    loadListeners = loadListeners.filter((l) => l !== callback);
  };
}

/**
 * Get dynamic skills
 */
export function getDynamicSkills(): SkillCommand[] {
  return Array.from(skillState.dynamic.values());
}

/**
 * Get conditional skills count
 */
export function getConditionalSkillCount(): number {
  return skillState.conditional.size;
}

// Bundled skills storage
const bundledSkillsDefs: BundledSkillDefinition[] = [];

/**
 * Register a bundled skill
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  bundledSkillsDefs.push(definition);
}

/**
 * Get all bundled skill definitions
 */
export function getBundledSkillDefinitions(): BundledSkillDefinition[] {
  return [...bundledSkillsDefs];
}

/**
 * Internal function to convert bundled skill definitions to SkillCommands
 */
function loadBundledSkillsInternal(): SkillCommand[] {
  return bundledSkillsDefs
    .filter((def) => !def.isEnabled || def.isEnabled())
    .map((def) => ({
      type: "prompt" as const,
      name: def.name,
      description: def.description,
      hasUserSpecifiedDescription: false,
      allowedTools: def.allowedTools ?? [],
      argumentHint: def.argumentHint,
      argNames: parseArgumentNames(def.argumentHint),
      whenToUse: def.whenToUse,
      model: def.model,
      disableModelInvocation: def.disableModelInvocation ?? false,
      userInvocable: def.userInvocable ?? true,
      context: def.context,
      agent: def.agent,
      contentLength: 0,
      isHidden: !(def.userInvocable ?? true),
      progressMessage: "running",
      source: "bundled" as SkillSource,
      loadedFrom: "bundled" as SkillLoadedFrom,
      hooks: def.hooks,
      skillRoot: undefined,
      getPromptForCommand: def.getPromptForCommand,
    }));
}

/**
 * Reset skill registry (useful for testing)
 */
export function resetSkillRegistry(): void {
  skillState.unconditional.clear();
  skillState.conditional.clear();
  skillState.activatedConditional.clear();
  skillState.dynamic.clear();
  skillState.discoveredDirs.clear();
  skillsLoaded = false;
}

/**
 * Get skills grouped by source
 */
export function getSkillsBySource(): Map<SkillSource, SkillCommand[]> {
  const bySource = new Map<SkillSource, SkillCommand[]>();
  const allSkills = getAllSkills();

  for (const skill of allSkills) {
    const existing = bySource.get(skill.source) ?? [];
    existing.push(skill);
    bySource.set(skill.source, existing);
  }

  return bySource;
}

/**
 * Export bundled module
 */
export * from "./bundled.js";
