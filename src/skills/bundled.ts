/**
 * Bundled Skills Registry
 *
 * Built-in skills that are always available.
 * Ported from Claude Code's skills system, adapted for Koi.
 */

import {
  registerBundledSkill as registerSkill,
  getBundledSkillDefinitions,
} from "./loader.js";
import type { BundledSkillDefinition } from "./types.js";

// Re-export for bundled skill files
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  registerSkill(definition);
}

export { getBundledSkillDefinitions };

// =============================================================================
// Bundled Skills
// =============================================================================

import { registerUpdateConfigSkill } from "./bundled/updateConfig.js";
import { registerDebugSkill } from "./bundled/debug.js";
import { registerLoremIpsumSkill } from "./bundled/loremIpsum.js";
import { registerSkillifySkill } from "./bundled/skillify.js";
import { registerRememberSkill } from "./bundled/remember.js";
import { registerSimplifySkill } from "./bundled/simplify.js";
import { registerBatchSkill } from "./bundled/batch.js";
import { registerStuckSkill } from "./bundled/stuck.js";

/**
 * Initialize all bundled skills.
 */
export function initBundledSkills(): void {
  registerUpdateConfigSkill();
  registerDebugSkill();
  registerLoremIpsumSkill();
  registerSkillifySkill();
  registerRememberSkill();
  registerSimplifySkill();
  registerBatchSkill();
  registerStuckSkill();
}
