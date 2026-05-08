/**
 * Agent Session Manager
 *
 * Creates a full Pi AgentSession with all infrastructure:
 * AuthStorage, ModelRegistry, SettingsManager, SessionManager, ResourceLoader,
 * ExtensionRunner, and built-in coding tools.
 */

import path from "path";
import os from "os";
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import type {
  AgentSession,
  CreateAgentSessionResult,
} from "@mariozechner/pi-coding-agent";
import {
  getPiAuthStorage,
  getPiModelRegistry,
  getPiSettingsManager,
  getCurrentPiModel,
} from "../config/settings.js";
import { createCodingToolDefinitions } from "../tools/index.js";

const PI_AGENT_DIR = path.join(os.homedir(), ".config", "koi", "pi");

export async function createKoiSession(): Promise<CreateAgentSessionResult> {
  const authStorage = getPiAuthStorage();
  const modelRegistry = getPiModelRegistry();
  const settingsManager = getPiSettingsManager();
  const currentModel = getCurrentPiModel();

  const customTools = createCodingToolDefinitions(process.cwd());

  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage,
    modelRegistry,
    settingsManager,
    model: currentModel,
    noTools: "builtin",
    customTools,
  });

  return result;
}

export type { AgentSession, CreateAgentSessionResult };
