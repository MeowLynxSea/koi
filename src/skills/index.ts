/**
 * Skills Module
 *
 * Main entry point for the Skills system.
 * Re-exports all public types and functions.
 * 
 * Features:
 * - Load skills from ~/.config/koi/skills, ~/.claude/skills, and .claude/skills
 * - SKILL.md format with YAML frontmatter
 * - Built-in bundled skills
 * - Conditional skills (path-based activation)
 * - Dynamic skill discovery
 * - Argument substitution ({{skill.args}}, <arg>)
 */

// Types
export type {
  SkillCommand,
  SkillWithPath,
  SkillSource,
  SkillLoadedFrom,
  BundledSkillDefinition,
  SkillFrontmatter,
  SkillInvocationResult,
  ToolUseContext,
  HooksSettings,
  FrontmatterShell,
  ParsedFields,
} from "./types.js";

// Core loader functions
export {
  loadAllSkills,
  getAllSkills,
  getActiveSkills,
  getSkillByName,
  hasSkill,
  getSkillsBySource,
  getSkillsPath,
  onSkillsLoaded,
  discoverSkillDirsForPaths,
  addSkillDirectories,
  activateConditionalSkillsForPaths,
  getDynamicSkills,
  getConditionalSkillCount,
  resetSkillRegistry,
} from "./loader.js";

// Bundled skills
export {
  registerBundledSkill,
  getBundledSkillDefinitions,
  initBundledSkills,
} from "./bundled.js";

// Skill invocation
export {
  parseSkillInvocation,
  isSkillInvocation,
  detectSkillInvocation,
  invokeSkill,
  isSkillAvailable,
  getInvokableSkills,
  formatSkillForDisplay,
  getSkillSuggestions,
  getSkillCountBySource,
  hasAnySkills,
  createToolUseContext,
} from "./invoke.js";

// Substitution utilities
export {
  substituteArguments,
  parseArgumentNames,
  parseNamedArguments,
} from "./substitution.js";

// Components
export { SkillsMenu, SkillsMenuStandalone } from "./SkillsMenu.js";

// Re-export frontmatter utilities for advanced usage
export {
  parseFrontmatter,
  parseFrontmatterFields,
  extractArgNames,
  estimateTokens,
} from "./frontmatter.js";
