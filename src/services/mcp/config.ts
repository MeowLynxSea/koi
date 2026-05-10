/**
 * MCP Configuration Management
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { McpJsonConfig, ScopedMcpConfig, McpServerConfig, ConnectionStatus } from "./types.js";

const KOI_CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const MCP_CONFIG_FILE = path.join(KOI_CONFIG_DIR, "mcp.json");

let mcpConfigs: Map<string, ScopedMcpConfig> = new Map();
let disabledServers: Set<string> = new Set();
let configsLoaded = false;

function ensureConfigDir(): void {
  if (!fs.existsSync(KOI_CONFIG_DIR)) {
    fs.mkdirSync(KOI_CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadConfigFile(): void {
  if (!fs.existsSync(MCP_CONFIG_FILE)) return;
  try {
    const raw = fs.readFileSync(MCP_CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw) as McpJsonConfig;
    if (data.mcpServers) {
      for (const [name, config] of Object.entries(data.mcpServers)) {
        const cfg = config as McpServerConfig;
        if (cfg.command || cfg.url) {
          mcpConfigs.set(name, { ...cfg, scope: "user" });
        }
      }
    }
  } catch {
    // Ignore corrupt config files
  }
}

function saveConfigFile(): void {
  ensureConfigDir();
  const servers: Record<string, McpServerConfig> = {};
  for (const [name, scopedConfig] of mcpConfigs) {
    if (scopedConfig.scope === "user") {
      const { scope: _scope, description: _desc, enabled: _enabled, ...config } = scopedConfig;
      servers[name] = config;
    }
  }
  fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify({ mcpServers: servers }, null, 2) + "\n", { mode: 0o600 });
}

export function loadMcpConfigs(): void {
  if (configsLoaded) return;
  loadConfigFile();
  configsLoaded = true;
}

export function loadProjectMcpConfig(cwd: string): ScopedMcpConfig[] {
  const configPath = path.join(cwd, ".mcp.json");
  if (!fs.existsSync(configPath)) return [];
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw) as McpJsonConfig;
    const configs: ScopedMcpConfig[] = [];
    if (data.mcpServers) {
      for (const [, config] of Object.entries(data.mcpServers)) {
        const cfg = config as McpServerConfig;
        if (cfg.command || cfg.url) {
          configs.push({ ...cfg, scope: "project" });
        }
      }
    }
    return configs;
  } catch {
    return [];
  }
}

export function loadLocalMcpConfig(cwd: string): ScopedMcpConfig[] {
  const configPath = path.join(cwd, ".mcp.json.local");
  if (!fs.existsSync(configPath)) return [];
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw) as McpJsonConfig;
    const configs: ScopedMcpConfig[] = [];
    if (data.mcpServers) {
      for (const [, config] of Object.entries(data.mcpServers)) {
        const cfg = config as McpServerConfig;
        if (cfg.command || cfg.url) {
          configs.push({ ...cfg, scope: "local" });
        }
      }
    }
    return configs;
  } catch {
    return [];
  }
}

export function setMcpConfig(name: string, config: McpServerConfig, scope: "user" | "project" | "local" = "user"): void {
  mcpConfigs.set(name, { ...config, scope });
  if (scope === "user") saveConfigFile();
}

export function getMcpConfig(name: string): ScopedMcpConfig | undefined {
  return mcpConfigs.get(name);
}

export function getAllMcpConfigs(): Map<string, ScopedMcpConfig> {
  return new Map(mcpConfigs);
}

export function getMcpConfigsByScope(scope: "user" | "project" | "local"): ScopedMcpConfig[] {
  return Array.from(mcpConfigs.values()).filter(c => c.scope === scope);
}

export function removeMcpConfig(name: string): boolean {
  const config = mcpConfigs.get(name);
  if (!config) return false;
  mcpConfigs.delete(name);
  disabledServers.delete(name);
  if (config.scope === "user") saveConfigFile();
  return true;
}

export function isMcpServerDisabled(name: string): boolean {
  return disabledServers.has(name);
}

export function setMcpServerEnabled(name: string, enabled: boolean): void {
  if (enabled) disabledServers.delete(name);
  else disabledServers.add(name);
}

export function getMcpServerNames(): string[] {
  return Array.from(mcpConfigs.keys());
}

let serverStatuses: Map<string, ConnectionStatus> = new Map();

export function updateServerStatus(name: string, status: ConnectionStatus): void {
  serverStatuses.set(name, status);
}

export function getServerStatus(name: string): ConnectionStatus | undefined {
  return serverStatuses.get(name);
}

export function getAllServerStatuses(): Map<string, ConnectionStatus> {
  return new Map(serverStatuses);
}

export interface McpConfigValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export function validateMcpConfig(name: string, config: unknown): McpConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name || typeof name !== "string") {
    errors.push("Server name is required");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    errors.push("Server name must contain only alphanumeric characters, hyphens, and underscores");
  }

  if (!config || typeof config !== "object") {
    errors.push("Invalid MCP server configuration");
    return { valid: false, errors, warnings };
  }

  const serverConfig = config as McpServerConfig;
  if (serverConfig.command) {
    // stdio config
  } else if (serverConfig.url) {
    try { new URL(serverConfig.url); }
    catch { errors.push("Invalid URL format"); }
    if (serverConfig.url.startsWith("http://") && !serverConfig.url.includes("localhost")) {
      warnings.push("Using HTTP instead of HTTPS may expose credentials");
    }
  } else {
    errors.push("Either command or url is required");
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined, warnings: warnings.length > 0 ? warnings : undefined };
}

export interface McpConfigExport {
  version: number;
  servers: Record<string, McpServerConfig>;
}

export function exportMcpConfigs(): McpConfigExport {
  const servers: Record<string, McpServerConfig> = {};
  for (const [name, scopedConfig] of mcpConfigs) {
    const { scope: _scope, description: _desc, enabled: _enabled, ...config } = scopedConfig;
    servers[name] = config;
  }
  return { version: 1, servers };
}

export function importMcpConfigs(exported: McpConfigExport): number {
  let imported = 0;
  for (const [name, config] of Object.entries(exported.servers)) {
    if (config.command || config.url) {
      setMcpConfig(name, config, "user");
      imported++;
    }
  }
  return imported;
}
