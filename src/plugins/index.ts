/**
 * Plugin System Public API
 */

export {
  registerBuiltinPlugin,
  getBuiltinPluginDefinitions,
  getBuiltinPluginDefinition,
  loadBuiltinPlugin,
  loadAllBuiltinPlugins,
} from "./builtin.js";

export {
  discoverPlugins,
  loadPlugin,
  loadAllPlugins,
} from "./loader.js";

export {
  refreshActivePlugins,
  loadAllPluginsForDiscovery,
  getActivePlugins,
} from "./refresh.js";

export {
  getPluginSettings,
  setPluginSettings,
  isPluginEnabled,
  enablePlugin,
  disablePlugin,
  getPluginSetting,
  setPluginSetting,
  getSettingsHooks,
  invalidatePluginSettingsCache,
} from "./settings.js";

export {
  isPluginTrusted,
  trustPlugin,
  revokePluginTrust,
  promptForTrust,
} from "./trust.js";

export type {
  PluginManifest,
  LoadedPlugin,
  BuiltinPluginDefinition,
  PluginError,
  PluginSettingsSection,
  PluginComponent,
  PluginAuthor,
  CommandMetadata,
  PluginUserConfigOption,
} from "./types.js";

export {
  PluginManifestSchema,
  HookCommandSchema,
  HookMatcherSchema,
  HooksSettingsSchema,
} from "./schemas.js";
