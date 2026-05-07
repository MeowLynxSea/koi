/**
 * Settings / Configuration Manager
 *
 * In-memory user preferences: configured providers, current model,
 * session title. Persists via a simple runtime store.
 */

import { getProviders, getModels, type KnownProvider, type Model, type Api } from "@mariozechner/pi-ai";

export interface ModelRef {
  provider: string;
  modelId: string;
}

export type AuthMethod = "apikey" | "oauth";

export interface ProviderConfig {
  provider: string;
  authMethod: AuthMethod;
  credential: string; // api key or oauth token
}

let sessionTitle = "New Session";
let providerConfigs = new Map<string, ProviderConfig>();
let currentModel: ModelRef | null = null;

export function getSessionTitle(): string {
  return sessionTitle;
}

export function setSessionTitle(title: string): void {
  sessionTitle = title;
}

export function configureProvider(config: ProviderConfig): void {
  providerConfigs.set(config.provider, config);
}

export function removeProvider(provider: string): void {
  providerConfigs.delete(provider);
}

export function isProviderConfigured(provider: string): boolean {
  return providerConfigs.has(provider);
}

export function getProviderConfig(provider: string): ProviderConfig | undefined {
  return providerConfigs.get(provider);
}

export function getConfiguredProviders(): string[] {
  return Array.from(providerConfigs.keys());
}

export function getCurrentModel(): ModelRef | null {
  return currentModel;
}

export function setCurrentModel(ref: ModelRef | null): void {
  currentModel = ref;
}

export function getAllProviders(): string[] {
  return getProviders();
}

export function getProviderModels(provider: string): Model<Api>[] {
  return getModels(provider as KnownProvider);
}
