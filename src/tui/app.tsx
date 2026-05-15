/**
 * TUI Application
 *
 * Orchestrates the terminal UI using OpenTUI React: layout manager,
 * event routing, and the main render loop.
 * Integrates with Pi AgentSession for LLM agent loop.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { SyntaxStyle, createTextAttributes, type TextareaRenderable, type KeyBinding } from "@opentui/core";
import { useDialog } from "@opentui-ui/dialog/react";

/* ───────── Components ───────── */
import {
  ChatPanel,
  type ChatPanelHandle,
  wrapText,
  isToolExpandable,
  isToolForceExpanded,
} from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { usePasteHandler } from "./hooks/paste-handler.js";
import { PendingArea } from "./components/pending-area.js";
import { EditPendingModal } from "./components/edit-pending-modal.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { ExitModal } from "./components/exit-modal.js";
import { CommandPanel, type CommandDef } from "./components/command-panel.js";
import { RenameModal } from "./components/rename-modal.js";
import { ConnectModal } from "./components/connect-modal.js";
import { ModelModal } from "./components/model-modal.js";
import { SessionModal } from "./components/session-modal.js";
import { ConfirmModal } from "./components/confirm-modal.js";
import { ConnectingModal } from "./components/connecting-modal.js";
import { ForkModal } from "./components/fork-modal.js";
import { ImagePreviewModal } from "./components/image-preview-modal.js";
import { ExternalEditorModal } from "./components/external-editor-modal.js";
import { AlertModal } from "./components/alert-modal.js";
import { PreferenceModal } from "./components/preference-modal.js";
import { openExternalEditor } from "./components/external-editor.js";
import { MCPSettings } from "./components/mcp/MCPSettings.js";
import { SkillsMenu } from "../skills/SkillsMenu.js";
import { CceModal } from "./components/cce/CceModal.js";
import { CceInitModal } from "./components/cce/CceInitModal.js";
import type { CceDownloadProgress } from "../cce/index.js";
import { 
  getActiveSkills, 
  detectSkillInvocation, 
  invokeSkill, 
  loadAllSkills,
  getSkillCountBySource,
  initBundledSkills,
} from "../skills/index.js";
import type { SkillCommand } from "../skills/types.js";
import type { InputBoxHandle } from "./components/input-box.js";
import { refreshMcpTools } from "../agent/session.js";

/* ───────── Skill Helpers ───────── */

function extractTextFromContent(content: unknown[]): string {
  const blocks = content as Array<{ type: string; text?: string }>;
  return blocks
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && "text" in block)
    .map((block) => block.text)
    .join("\n\n");
}

/* ───────── Agent & Config ───────── */
import {
  getCurrentModel,
  setCurrentModel,
  getAuxiliaryModel,
  setAuxiliaryModel,
  getExternalEditor,
  setExternalEditor,
  resolvePiModel,
  getConfiguredProviders,
  isProviderConfigured,
  isCustomProvider,
  getShowHooksMessages,
  setShowHooksMessages,
} from "../config/settings.js";
import { useKoiAgent, isInternalNotification } from "../agent/hooks.js";
import type { SessionMeta } from "../agent/session-store.js";
import { globalTaskManager, type Task } from "../agent/session-tasks.js";
import { subagentRegistry, type AsyncSubagentEntry } from "../agent/subagent-registry.js";
import { monitorRegistry, type MonitorEntry } from "../agent/monitor-registry.js";
import {
  subscribePermissions,
  getPermissionQueue,
  resolvePermission,
  isYoloMode,
  setYoloMode as setYoloModeGlobal,
} from "../agent/permission-ui.js";
import {
  getAgentMode,
  setAgentMode as setGlobalAgentMode,
  cycleAgentMode,
  getActiveToolNamesForMode,
  subscribeModeChanges,
  injectModeIntoSystemPrompt,
  type AgentMode,
} from "../agent/mode.js";
import {
  subscribeQuestions,
  getQuestionQueue,
  resolveQuestion,
} from "../agent/question-ui.js";
import {
  subscribePlanApprovals,
  getPlanApprovalQueue,
  resolvePlanApproval,
  type PlanApprovalResult,
} from "../agent/plan-ui.js";

const SIDEBAR_WIDTH = 28;

interface AppProps {
  renderer: import("@opentui/core").CliRenderer;
  onExit: () => void;
}

/**
 * Permission Formatting
 *
 * Converts raw tool arguments into a one-line human-readable string for the confirmation modal.
 * Each tool has a tailored formatter so the user sees "Command: rm -rf /" instead of raw JSON.
 */

const PERMISSION_FORMATTERS: Record<string, (args: Record<string, unknown>) => string> = {
  bash: (a) => `Command: ${String(a["command"] ?? "?")}`,
  webfetch: (a) => `URL: ${String(a["url"] ?? "?")}`,
  read: (a) => `Path: ${String(a["path"] ?? a["file"] ?? "?")}`,
  write: (a) => `Path: ${String(a["path"] ?? a["file"] ?? "?")}`,
  edit: (a) => `Path: ${String(a["path"] ?? a["file"] ?? "?")}`,
  grep: (a) => `Pattern: ${String(a["pattern"] ?? "?")}`,
  find: (a) => `Path: ${String(a["path"] ?? ".")}`,
  ls: (a) => `Path: ${String(a["path"] ?? ".")}`,
};

function formatPermissionArgs(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return JSON.stringify(args);
  const formatter = PERMISSION_FORMATTERS[toolName];
  return formatter ? formatter(args as Record<string, unknown>) : JSON.stringify(args, null, 2);
}

function CustomPromptContent({
  resolve,
  question,
  width,
  height,
}: {
  resolve: (value: string) => void;
  question: string;
  width: number;
  height: number;
}) {
  const taRef = useRef<TextareaRenderable>(null);
  const handleSubmit = () => {
    resolve(taRef.current?.editBuffer.getText() ?? "");
  };
  const contentWidth = Math.min(70, Math.max(20, width - 8));
  const questionLines = wrapText(question, contentWidth - 4, 0);
  const keyBindings = useMemo<KeyBinding[]>(() => [{ name: "return", action: "submit" }], []);

  return (
    <box
      flexDirection="column"
      alignSelf="center"
      borderStyle="rounded"
      borderColor="#4a4a5a"
      backgroundColor="#1a1a2e"
      paddingX={2}
      paddingY={1}
      width={contentWidth}
      maxHeight={Math.max(10, height - 6)}
    >
      <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
        Custom Answer
      </text>
      <box flexDirection="column" gap={1}>
        {questionLines.map((line, i) => (
          <text key={`q-${i}`} wrapMode="none" fg="#f8f8f2">{line}</text>
        ))}
      </box>
      <box marginTop={1} height={3}>
        <textarea
          ref={taRef}
          initialValue=""
          focused={true}
          showCursor={true}
          height={3}
          onSubmit={handleSubmit}
          keyBindings={keyBindings}
        />
      </box>
      <box alignSelf="center" marginTop={1} flexDirection="row" gap={2}>
        <box paddingX={2} backgroundColor="#2dd4bf" onMouseUp={handleSubmit}>
          <text fg="white" attributes={createTextAttributes({ bold: true })}>Submit</text>
        </box>
        <box paddingX={2} backgroundColor="#f43f5e" onMouseUp={() => resolve("")}>
          <text fg="white" attributes={createTextAttributes({ bold: true })}>Cancel</text>
        </box>
      </box>
    </box>
  );
}

/**
 * App Component
 *
 * Root TUI layout: chat panel + input + sidebar on the left, modals overlay on top.
 * Keyboard shortcuts are globally bound here; modal-open state blocks shortcuts underneath.
 */

export function App({ renderer, onExit }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [showExitModal, setShowExitModal] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showForkModal, setShowForkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<SessionMeta | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState("");
  const [showEditPendingModal, setShowEditPendingModal] = useState(false);
  const [editPendingType, setEditPendingType] = useState<"sheer" | "queued" | null>(null);
  const [editPendingIndex, setEditPendingIndex] = useState(-1);
  const [editPendingText, setEditPendingText] = useState("");
  const [currentModel, setCurrentModelState] = useState(getCurrentModel);
  const [, setAuxiliaryModelState] = useState(getAuxiliaryModel);

  const [sidebarContextUsage, setSidebarContextUsage] = useState("0%");
  const [sidebarTokenCount, setSidebarTokenCount] = useState("(0)");
  const [sidebarCost, setSidebarCost] = useState("$0.00");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subagents, setSubagents] = useState<AsyncSubagentEntry[]>([]);
  const [monitors, setMonitors] = useState<MonitorEntry[]>([]);
  const [yoloMode, setYoloMode] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>(getAgentMode());
  const [showMCPSettings, setShowMCPSettings] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skills, setSkills] = useState<SkillCommand[]>([]);
  const [showExternalEditorModal, setShowExternalEditorModal] = useState(false);
  const [externalEditorBusy, setExternalEditorBusy] = useState(false);
  const [externalEditorResult, setExternalEditorResult] = useState<string | null | undefined>(undefined);
  const [externalEditorError, setExternalEditorError] = useState<string | null>(null);
  const [showCceModal, setShowCceModal] = useState(false);
  const [showCceInitModal, setShowCceInitModal] = useState(false);
  const [cceInitMessage, setCceInitMessage] = useState("");
  const [cceInitDownloadProgress, setCceInitDownloadProgress] = useState<CceDownloadProgress | null>(null);
  const [showModelAlert, setShowModelAlert] = useState(false);
  const [modelAlertMessage, setModelAlertMessage] = useState("");
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [showHooksMessages, setShowHooksMessagesState] = useState(getShowHooksMessages());

  // Sync yoloMode to global permission-ui state
  useEffect(() => {
    setYoloModeGlobal(yoloMode);
  }, [yoloMode]);

  const dialog = useDialog();

  // Load skills on mount
  useEffect(() => {
    void (async () => {
      // Register built-in bundled skills first
      initBundledSkills();
      
      // Load all skills from configured directories
      await loadAllSkills(process.cwd());
      
      // Use getActiveSkills to get all loaded skills
      const activeSkills = getActiveSkills();
      setSkills(activeSkills as SkillCommand[]);
      
      console.log("[skills] Loaded:", getSkillCountBySource());
    })();
  }, []);

  // Auto-initialize CCE on startup if enabled in settings
  useEffect(() => {
    void (async () => {
      const settingsMod: { isCceEnabled: () => boolean } = await import("../config/settings.js");
      const cceMod: {
        initCceSystem: (onProgress?: (msg: string) => void, onDownloadProgress?: (progress: CceDownloadProgress) => void) => Promise<import("../cce/index.js").CceSystem>;
        startCceServices: () => void;
        isCceSystemReady: () => boolean;
      } = await import("../cce/index.js");
      if (!settingsMod.isCceEnabled() || cceMod.isCceSystemReady()) return;

      setShowCceInitModal(true);
      try {
        await cceMod.initCceSystem(
          (msg) => setCceInitMessage(msg),
          (p) => setCceInitDownloadProgress(p),
        );
        cceMod.startCceServices();
      } catch (err) {
        console.error("[CCE] Auto-init failed on startup:", err);
      } finally {
        setShowCceInitModal(false);
        setCceInitMessage("");
        setCceInitDownloadProgress(null);
      }
    })();
  }, []);

  const {
    session,
    messages,
    isStreaming,
    isReady,
    error,
    steeringMessages,
    followUpMessages,
    isConnectingMcp,
    mcpConnectionProgress,
    prompt,
    steer,
    followUp,
    abort,
    toggleCollapse,
    expandAll,
    collapseAll,
    removePendingMessage,
    switchSession,
    newSession,
    forkSession,
    sessionList,
    refreshSessionList,
    currentSessionId,
    saveCurrentState,
    sessionTitle,
    setSessionTitle,
    deleteSession,
    addPlanMessage,
    syncAgentMode,
  } = useKoiAgent();

  // Handle skill invocation from skills menu
  const handleInvokeSkill = useCallback(
    async (skill: SkillCommand, args: string) => {
      const content = await invokeSkill(skill, args, session);
      const skillPrompt = extractTextFromContent(content);
      if (skillPrompt) {
        await prompt(skillPrompt, `/${skill.name}${args ? " " + args : ""}`);
      }
      setShowSkillsModal(false);
    },
    [session, prompt]
  );

  // Sync agent mode changes to the active session's tool set
  const applyAgentMode = useCallback(
    (mode: AgentMode) => {
      setGlobalAgentMode(mode);
      setAgentMode(mode);
      syncAgentMode(mode);
    },
    [syncAgentMode]
  );

  const handleModeSwitch = useCallback(() => {
    const next = cycleAgentMode();
    applyAgentMode(next);
  }, [applyAgentMode]);

  // Subscribe to external mode changes (e.g. from tools) so UI stays in sync
  useEffect(() => {
    return subscribeModeChanges(() => {
      const mode = getAgentMode();
      setAgentMode(mode);
    });
  }, []);

  // Apply tool restrictions and inject mode awareness into system prompt
  useEffect(() => {
    if (!session) return;
    session.setActiveToolsByName(getActiveToolNamesForMode(agentMode));
    injectModeIntoSystemPrompt(session, agentMode);
  }, [agentMode, session]);

  // Subscribe to subagent registry changes for live sidebar updates.
  useEffect(() => {
    const unsubscribe = subagentRegistry.subscribe(() => {
      // Only show subagents for the current session
      setSubagents(currentSessionId ? subagentRegistry.getBySession(currentSessionId) : []);
    });
    // Re-filter when session changes
    if (currentSessionId) {
      setSubagents(subagentRegistry.getBySession(currentSessionId));
    }
    return unsubscribe;
  }, [currentSessionId]);

  // Subscribe to monitor registry changes for live sidebar updates.
  // Filters to show only monitors for the current session.
  useEffect(() => {
    const unsubscribe = monitorRegistry.subscribe(() => {
      // Only show monitors belonging to the current session
      if (currentSessionId) {
        setMonitors(monitorRegistry.getBySession(currentSessionId));
      }
    });
    // Re-filter when session changes
    if (currentSessionId) {
      setMonitors(monitorRegistry.getBySession(currentSessionId));
    }
    return unsubscribe;
  }, [currentSessionId]);

  // Polls session stats (token count, cost, context usage) every 2s for the sidebar.
  // Falls back to zeroed values when no session is active.
  useEffect(() => {
    const update = () => {
      if (!session) {
        setSidebarContextUsage("0%");
        setSidebarTokenCount("(0)");
        setSidebarCost("$0.00");
        setTasks([]);
        setSubagents([]);
        // Clear subagents from registry display for this session
        subagentRegistry.clearSession(currentSessionId ?? "");
        return;
      }

      const usage = session.getContextUsage();
      const stats = session.getSessionStats();
      const model = session.model;

      let totalCost = 0;
      if (model && stats) {
        const costInput = (stats.tokens.input * model.cost.input) / 1_000_000;
        const costOutput = (stats.tokens.output * model.cost.output) / 1_000_000;
        const costCacheRead = (stats.tokens.cacheRead * model.cost.cacheRead) / 1_000_000;
        const costCacheWrite = (stats.tokens.cacheWrite * model.cost.cacheWrite) / 1_000_000;
        totalCost = costInput + costOutput + costCacheRead + costCacheWrite;
      }

      const tokens = usage?.tokens ?? 0;
      const tokenStr =
        tokens >= 1000 ? `(${(tokens / 1000).toFixed(1)}K)` : tokens > 0 ? `(${tokens})` : "(0)";
      const percentStr = usage?.percent != null ? `${Math.round(usage.percent)}%` : "0%";
      const costStr = totalCost > 0 ? `$${totalCost.toFixed(2)}` : "$0.00";

      setSidebarContextUsage(percentStr);
      setSidebarTokenCount(tokenStr);
      setSidebarCost(costStr);
      setTasks(globalTaskManager.listTasks());
      // Only show subagents for the current session
      setSubagents(currentSessionId ? subagentRegistry.getBySession(currentSessionId) : []);
      // Only show monitors for the current session
      setMonitors(currentSessionId ? monitorRegistry.getBySession(currentSessionId) : []);
    };

    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [session, currentSessionId]);

  // Processes the permission-request queue one item at a time.
  // Shows a styled confirm modal; keyboard y/n also works while the modal is open.
  const processingPermissionRef = useRef(false);
  const permissionResolveRef = useRef<((value: boolean) => void) | null>(null);
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);

  // Keyboard shortcut refs for dialog-based modals (not React-state modals).
  const planApprovalResolveRef = useRef<((value: string) => void) | null>(null);
  const questionResolveRef = useRef<((value: string) => void) | null>(null);
  const questionOptionsRef = useRef<string[]>([]);

  // Process the next permission in the queue (if any).
  // This function is called both when new permissions are added and when
  // a permission is resolved, to ensure multiple pending permissions are handled.
  const processPermissionQueue = useCallback(async () => {
    if (processingPermissionRef.current) return;
    const queue = getPermissionQueue();
    if (queue.length === 0) return;

    const request = queue[0];
    if (!request) {
      processingPermissionRef.current = false;
      return;
    }

    // In YOLO mode, auto-approve all permissions
    if (isYoloMode()) {
      void resolvePermission(request.id, true);
      // Use setTimeout to allow the queue to be processed recursively
      setTimeout(() => { void processPermissionQueue(); }, 0);
      return;
    }

    processingPermissionRef.current = true;
    setPermissionModalOpen(true);

    const allowed = await dialog.confirm({
      backdropColor: "#000000",
      backdropOpacity: "50%",
      closeOnEscape: true,
      unstyled: true,
      content: ({ resolve }) => {
        permissionResolveRef.current = resolve;
        const contentWidth = Math.min(70, Math.max(20, width - 8));
        const textWidth = Math.max(1, contentWidth - 6);
        const toolLines = wrapText(`Tool: ${request.toolName}`, textWidth, 0);
        const argsLines = wrapText(formatPermissionArgs(request.toolName, request.args), textWidth, 0);
        const reasonLines = wrapText(`Reason: ${request.reason}`, textWidth, 0);
        return (
          <box
            flexDirection="column"
            alignSelf="center"
            borderStyle="rounded"
            borderColor="#4a4a5a"
            backgroundColor="#1a1a2e"
            paddingX={2}
            paddingY={1}
            width={contentWidth}
            maxHeight={Math.max(10, height - 6)}
          >
            <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#fbbf24">
              Permission Request
            </text>
            <box flexDirection="column" gap={1}>
              <box flexDirection="column">
                {toolLines.map((line, i) => (
                  <text key={`t-${i}`} wrapMode="none" fg="#00f5ff">{line}</text>
                ))}
              </box>
              <box flexDirection="column">
                {argsLines.map((line, i) => (
                  <text key={`a-${i}`} wrapMode="none" fg="#a5b4fc">{line}</text>
                ))}
              </box>
              <box flexDirection="column">
                {reasonLines.map((line, i) => (
                  <text key={`r-${i}`} wrapMode="none" fg="#ff79c6">{line}</text>
                ))}
              </box>
            </box>
            <box alignSelf="center" marginTop={1} flexDirection="row" gap={2}>
              <box paddingX={2} backgroundColor="#2dd4bf" onMouseUp={() => resolve(true)}>
                <text fg="white" attributes={createTextAttributes({ bold: true })}>Yes</text>
              </box>
              <box paddingX={2} backgroundColor="#f43f5e" onMouseUp={() => resolve(false)}>
                <text fg="white" attributes={createTextAttributes({ bold: true })}>No!</text>
              </box>
            </box>
          </box>
        );
      },
    });

    void resolvePermission(request.id, allowed);
    processingPermissionRef.current = false;
    setPermissionModalOpen(false);
    permissionResolveRef.current = null;

    // After resolving, check if there are more permissions in the queue and process them.
    // Use setTimeout to avoid blocking and allow the event loop to settle.
    setTimeout(() => { void processPermissionQueue(); }, 0);
  }, [dialog, width, height]);

  useEffect(() => {
    const unsubscribe = subscribePermissions(() => {
      void processPermissionQueue();
    });
    return unsubscribe;
  }, [processPermissionQueue]);

  // Processes the askUserQuestion queue one item at a time.
  const processingQuestionRef = useRef(false);
  useEffect(() => {
    const unsubscribe = subscribeQuestions(async () => {
      if (processingQuestionRef.current) return;
      const queue = getQuestionQueue();
      if (queue.length === 0) return;
      const request = queue[0];
      if (!request) {
        processingQuestionRef.current = false;
        return;
      }

      processingQuestionRef.current = true;
      const allOptions = [...request.options, "__other__"];
      let answer = "";

      for (;;) {
        const choiceResult = await dialog.choice<string>({
          backdropColor: "#000000",
          backdropOpacity: "50%",
          closeOnEscape: true,
          unstyled: true,
          content: ({ resolve, dismiss: _dismiss }) => {
            questionResolveRef.current = resolve;
            questionOptionsRef.current = allOptions;
            const contentWidth = Math.min(70, Math.max(20, width - 8));
            const questionLines = wrapText(request.question, contentWidth - 4, 0);
            return (
              <box
                flexDirection="column"
                alignSelf="center"
                borderStyle="rounded"
                borderColor="#4a4a5a"
                backgroundColor="#1a1a2e"
                paddingX={2}
                paddingY={1}
                width={contentWidth}
                maxHeight={Math.max(10, height - 6)}
              >
                <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
                  Question
                </text>
                <box flexDirection="column" gap={1}>
                  {questionLines.map((line, i) => (
                    <text key={`q-${i}`} wrapMode="none" fg="#f8f8f2">{line}</text>
                  ))}
                </box>
                <box flexDirection="column" gap={1} marginTop={1}>
                  {allOptions.map((opt, idx) => {
                    const label = opt === "__other__" ? "Other (custom)" : opt;
                    return (
                      <box
                        key={opt}
                        paddingX={1}
                        paddingY={1}
                        backgroundColor="#2d2d44"
                        onMouseUp={() => resolve(opt)}
                      >
                        <text fg="#f8f8f2">{`[${idx + 1}] ${label}`}</text>
                      </box>
                    );
                  })}
                </box>
                <box alignSelf="center" marginTop={1}>
                  <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                    {`Press 1-${allOptions.length} to select, Esc to cancel`}
                  </text>
                </box>
              </box>
            );
          },
        });

        questionResolveRef.current = null;
        questionOptionsRef.current = [];
        if (choiceResult === "__other__") {
          const custom = await dialog.prompt<string>({
            backdropColor: "#000000",
            backdropOpacity: "50%",
            closeOnEscape: true,
            unstyled: true,
            content: ({ resolve }) => (
              <CustomPromptContent
                resolve={resolve}
                question={request.question}
                width={width}
                height={height}
              />
            ),
          });
          if (custom !== undefined && custom.trim() !== "") {
            answer = custom;
            break;
          }
          // cancelled or empty input — loop back to choice dialog
        } else {
          answer = choiceResult ?? "";
          break;
        }
      }

      resolveQuestion(request.id, answer);
      processingQuestionRef.current = false;
    });

    return unsubscribe;
  }, [dialog, width, height]);

  // Processes the plan-approval queue.
  const processingPlanApprovalRef = useRef(false);
  useEffect(() => {
    const unsubscribe = subscribePlanApprovals(async () => {
      if (processingPlanApprovalRef.current) return;
      const queue = getPlanApprovalQueue();
      if (queue.length === 0) return;
      const request = queue[0];
      if (!request) {
        processingPlanApprovalRef.current = false;
        return;
      }

      processingPlanApprovalRef.current = true;
      const modalWidth = Math.min(80, Math.max(40, width - 10));
      const planHeight = Math.max(8, height - 14);

      let approvalResult: PlanApprovalResult = { approved: false };

      for (;;) {
        const result = await dialog.choice<string>({
          backdropColor: "#000000",
          backdropOpacity: "50%",
          closeOnEscape: true,
          unstyled: true,
          content: ({ resolve, dismiss: _dismiss }) => {
            planApprovalResolveRef.current = resolve;
            const syntaxStyle = SyntaxStyle.create();
            syntaxStyle.registerStyle("markup.heading", { fg: "#60a5fa", bold: true });
            syntaxStyle.registerStyle("markup.strong", { bold: true });
            syntaxStyle.registerStyle("markup.italic", { fg: "#bd93f9", italic: true });
            syntaxStyle.registerStyle("markup.link", { fg: "#8be9fd", underline: true });
            syntaxStyle.registerStyle("markup.raw", { fg: "#a5b4fc" });
            syntaxStyle.registerStyle("markup.raw.block", { fg: "#f8f8f2", bg: "#44475a" });
            syntaxStyle.registerStyle("markup.list", { fg: "#ff79c6" });
            return (
              <box
                flexDirection="column"
                alignSelf="center"
                borderStyle="rounded"
                borderColor="#4a4a5a"
                backgroundColor="#1a1a2e"
                paddingX={2}
                paddingY={1}
                width={modalWidth}
                maxHeight={height - 4}
              >
                <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
                  Review Plan
                </text>
                <scrollbox scrollY={true} scrollX={false} height={planHeight} marginTop={1}>
                  <box flexDirection="column" width={modalWidth - 6}>
                    <markdown
                      content={request.plan}
                      syntaxStyle={syntaxStyle}
                      width={modalWidth - 6}
                      streaming={false}
                      conceal={true}
                    />
                  </box>
                </scrollbox>
                <box alignSelf="center" marginTop={1} flexDirection="row" gap={2}>
                  <box paddingX={2} backgroundColor="#2dd4bf" onMouseUp={() => resolve("yes")}>
                    <text fg="white" attributes={createTextAttributes({ bold: true })}>[Y]es</text>
                  </box>
                  <box paddingX={2} backgroundColor="#f43f5e" onMouseUp={() => resolve("no")}>
                    <text fg="white" attributes={createTextAttributes({ bold: true })}>[N]o</text>
                  </box>
                  <box paddingX={2} backgroundColor="#fbbf24" onMouseUp={() => resolve("comment")}>
                    <text fg="white" attributes={createTextAttributes({ bold: true })}>[C]omment</text>
                  </box>
                </box>
              </box>
            );
          },
        });

        planApprovalResolveRef.current = null;
        if (result === "yes") {
          approvalResult = { approved: true };
          break;
        } else if (result === "comment") {
          const comment = await dialog.prompt<string>({
            backdropColor: "#000000",
            backdropOpacity: "50%",
            closeOnEscape: true,
            unstyled: true,
            content: ({ resolve }) => (
              <CustomPromptContent
                resolve={resolve}
                question="Enter your feedback on the plan:"
                width={width}
                height={height}
              />
            ),
          });
          if (comment !== undefined && comment.trim() !== "") {
            approvalResult = { approved: false, comment };
            break;
          }
          // cancelled or empty — loop back to plan review dialog
        } else {
          // "no" or ESC
          approvalResult = { approved: false };
          break;
        }
      }

      resolvePlanApproval(request.id, approvalResult);
      if (approvalResult.approved) {
        await addPlanMessage(request.plan);
        applyAgentMode("build");
      }
      processingPlanApprovalRef.current = false;
    });

    return unsubscribe;
  }, [addPlanMessage, applyAgentMode, dialog, width, height]);

  // Responsive layout: left column fills remaining width; sidebar is fixed at SIDEBAR_WIDTH.
  const leftWidth = Math.max(1, width - SIDEBAR_WIDTH - 2);
  const pendingCount = steeringMessages.length + followUpMessages.length;
  const pendingHeight = pendingCount > 0 ? Math.min(pendingCount, 3) + (pendingCount > 3 ? 1 : 0) : 0;
  const chatPanelHeight = Math.max(1, height - (error ? 1 : 0) - 5 - 1 - pendingHeight);
  const chatPanelRef = useRef<ChatPanelHandle>(null);
  const inputBoxRef = useRef<InputBoxHandle>(null);

  // Paste handler for files, images, and long text
  const insertTextIntoInput = useCallback((text: string) => {
    inputBoxRef.current?.insertText(text);
  }, []);
  const { handleImagePaste, handleTextFilePaste } = usePasteHandler(currentSessionId, insertTextIntoInput);

  // Filter out internal subagent notifications from the chat display.
  // These messages are still present in the session state (so the LLM sees
  // them), but we don't want to clutter the UI with XML task notifications.
  const visibleMessages = useMemo(
    () => {
      return messages
        .map((m) =>
          m.type === "user"
            ? { ...m, content: m.content.replace(/<koi_context>[\s\S]*?<\/koi_context>/g, "").trimEnd() }
            : m
        )
        .filter((m) => {
          // Filter out internal notifications
          if (m.type === "user" && isInternalNotification(m.content)) return false;
          // Filter out hook messages if setting is disabled
          // Hook messages are formatted as [EventLabel] message or Hook [...] or ✗ Hook [...]
          if (!showHooksMessages) {
            const content = "content" in m ? m.content : "";
            // Match [EventLabel] format used by forwardHookResult
            if (m.type === "system" && /^\[([\w]+)\]/.test(content)) return false;
            // Match Hook [...] format from onHookProgress
            if (content.includes("Hook [")) return false;
          }
          return true;
        });
    },
    [messages, showHooksMessages]
  );

  const anyModalOpen =
    showExitModal || showCommandPanel || showRenameModal || showConnectModal ||
    showModelModal || showSessionModal || showForkModal || permissionModalOpen || showDeleteConfirm || showImageModal || showEditPendingModal || showMCPSettings || showSkillsModal || showExternalEditorModal || externalEditorBusy || externalEditorError !== null || showCceModal || showCceInitModal || showPreferenceModal;

  // Thin wrapper handlers: mostly close modals after delegating to useKoiAgent actions.
  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || !isReady) return;

      // Check if model is configured before sending message
      if (!currentModel) {
        const hasProviders = getConfiguredProviders().length > 0;
        if (hasProviders) {
          setModelAlertMessage("No model selected. Use /model to select a model for the current provider.");
        } else {
          setModelAlertMessage("No provider configured. Use /connect to add an API provider and model.");
        }
        setShowModelAlert(true);
        return;
      }

      // Check if the provider has API key configured
      if (!isProviderConfigured(currentModel.provider) && !isCustomProvider(currentModel.provider)) {
        setModelAlertMessage(`No API key configured for ${currentModel.provider}. Use /connect to add credentials.`);
        setShowModelAlert(true);
        return;
      }

      // Handle /plan command to switch to plan mode
      if (text.trim() === "/plan") {
        applyAgentMode("plan");
        return;
      }

      // Handle /exit and /quit commands - exit directly without confirmation
      if (text.trim() === "/exit" || text.trim() === "/quit") {
        saveCurrentState();
        onExit();
        return;
      }

      // Handle /cce command - open CCE modal
      if (text.trim() === "/cce") {
        setShowCceModal(true);
        return;
      }

      // Handle /preference command - open preference modal
      if (text.trim() === "/preference") {
        setShowPreferenceModal(true);
        return;
      }

      // Handle skill invocation
      const skillInvocation = detectSkillInvocation(text);
      if (skillInvocation) {
        void (async () => {
          const content = await invokeSkill(skillInvocation.skill, skillInvocation.args, session);
          // Convert skill content to a prompt string
          const skillPrompt = extractTextFromContent(content);
          if (skillPrompt) {
            await prompt(skillPrompt, text.trim());
          }
        })();
        return;
      }

      if (isStreaming) {
        void steer(text);
      } else {
        void prompt(text, text);
      }
    },
    [isReady, isStreaming, steer, prompt, applyAgentMode, session, currentModel]
  );

  const handleQueueSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || !isReady) return;

      // Check if model is configured before sending message
      if (!currentModel) {
        const hasProviders = getConfiguredProviders().length > 0;
        if (hasProviders) {
          setModelAlertMessage("No model selected. Use /model to select a model for the current provider.");
        } else {
          setModelAlertMessage("No provider configured. Use /connect to add an API provider and model.");
        }
        setShowModelAlert(true);
        return;
      }

      // Check if the provider has API key configured
      if (!isProviderConfigured(currentModel.provider) && !isCustomProvider(currentModel.provider)) {
        setModelAlertMessage(`No API key configured for ${currentModel.provider}. Use /connect to add credentials.`);
        setShowModelAlert(true);
        return;
      }

      if (isStreaming) {
        void followUp(text);
      } else {
        void prompt(text, text);
      }
    },
    [isReady, isStreaming, followUp, prompt, currentModel]
  );

  const handleRename = useCallback((newTitle: string) => {
    setSessionTitle(newTitle);
    setShowRenameModal(false);
  }, [setSessionTitle]);

  const modelInfo = useMemo(() => {
    if (!currentModel) {
      return { modelName: "Not configured", provider: "Use /model to select" };
    }
    return { modelName: currentModel.modelId, provider: `via ${currentModel.provider}` };
  }, [currentModel]);

  const handleNewSession = useCallback(async () => {
    await newSession();
    setShowSessionModal(false);
  }, [newSession]);

  const handleSwitchSession = useCallback(async (filePath: string) => {
    await switchSession(filePath);
    setShowSessionModal(false);
  }, [switchSession]);

  const handleFork = useCallback(async (entryId: string) => {
    await forkSession(entryId);
    setShowForkModal(false);
  }, [forkSession]);

  const handleDeleteRequest = useCallback((sessionId: string) => {
    const meta = sessionList.find((s) => s.id === sessionId);
    if (!meta) return;
    setSessionToDelete(meta);
    setShowDeleteConfirm(true);
  }, [sessionList]);

  const handleConfirmDelete = useCallback(async () => {
    if (!sessionToDelete) return;
    await deleteSession(sessionToDelete.id);
    setShowDeleteConfirm(false);
    setSessionToDelete(null);
  }, [sessionToDelete, deleteSession]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    setSessionToDelete(null);
  }, []);

  const handleImageClick = useCallback((url: string) => {
    setImageModalUrl(url);
    setShowImageModal(true);
  }, []);

  const handleEditPending = useCallback(
    (type: "sheer" | "queued", index: number) => {
      const text = type === "sheer" ? steeringMessages[index] : followUpMessages[index];
      if (text === undefined) return;
      setEditPendingType(type);
      setEditPendingIndex(index);
      setEditPendingText(text);
      setShowEditPendingModal(true);
    },
    [steeringMessages, followUpMessages]
  );

  const handleConfirmEditPending = useCallback(
    (text: string) => {
      if (!editPendingType || editPendingIndex < 0) return;
      removePendingMessage(editPendingType, editPendingIndex);
      if (editPendingType === "sheer") {
        void steer(text);
      } else {
        void followUp(text);
      }
      setShowEditPendingModal(false);
    },
    [editPendingType, editPendingIndex, removePendingMessage, steer, followUp]
  );

  const handleCloseImageModal = useCallback(() => {
    setShowImageModal(false);
    setImageModalUrl("");
  }, []);

  // Build skill commands for the command palette
  const skillCommands = useMemo<CommandDef[]>(() => {
    return skills
      .filter((skill) => skill.userInvocable && !skill.isHidden)
      .map((skill) => ({
        id: `/${skill.name}`,
        label: skill.description || skill.name,
        section: "Skills",
        action: async () => {
          const content = await invokeSkill(skill, "", session);
          const skillPrompt = extractTextFromContent(content);
          if (skillPrompt) {
            await prompt(skillPrompt, `/${skill.name}`);
          }
        },
      }));
  }, [skills, session, prompt]);

  // Slash-command definitions for the command palette (Ctrl+P).
  const commands = useMemo<CommandDef[]>(
    () => [
      { id: "/new", label: "Start a new session", section: "Session", action: () => void handleNewSession(), disabled: isStreaming },
      { id: "/fork", label: "Fork current session", section: "Session", action: () => setShowForkModal(true), disabled: isStreaming },
      { id: "/sessions", label: "Browse sessions", section: "Session", action: async () => { await refreshSessionList(); setShowSessionModal(true); }, disabled: isStreaming },
      { id: "/compact", label: "Compact current session", section: "Session", action: () => { session?.compact().catch(() => {}); }, disabled: isStreaming },
      { id: "/rename", label: "Rename session", section: "Session", action: () => setShowRenameModal(true) },
      { id: "/exit", label: "Exit Koi", section: "Session", action: () => { saveCurrentState(); onExit(); } },
      { id: "/quit", label: "Exit Koi (alias)", section: "Session", action: () => { saveCurrentState(); onExit(); } },
      { id: "/yolo", label: "Toggle YOLO mode (auto-approve all permissions)", section: "Mode", action: () => setYoloMode((prev) => !prev) },
      { id: "/mode", label: `Cycle agent mode (${agentMode})`, section: "Mode", action: () => handleModeSwitch() },
      { id: "/plan", label: "Switch to plan mode (read-only, no file modifications)", section: "Mode", action: () => applyAgentMode("plan"), disabled: isStreaming },
      { id: "/connect", label: "Connect to a provider", section: "Model", action: () => setShowConnectModal(true) },
      { id: "/model", label: "Select a model", section: "Model", action: () => setShowModelModal(true), disabled: isStreaming },
      { id: "/mcp", label: "Open MCP settings", section: "Extensions", action: () => setShowMCPSettings(true) },
      { id: "/skills", label: "List and manage skills", section: "Extensions", action: () => setShowSkillsModal(true) },
      { id: "/editor", label: "Set external editor for prompts", section: "Settings", action: () => setShowExternalEditorModal(true) },
      { id: "/cce", label: "Open Cat's Context Engine", section: "Extensions", action: () => setShowCceModal(true) },
      { id: "/preference", label: "Open preferences", section: "Settings", action: () => setShowPreferenceModal(true) },
      ...skillCommands,
    ],
    [isStreaming, session, handleNewSession, refreshSessionList, agentMode, handleModeSwitch, applyAgentMode, skillCommands]
  );

  // Global keyboard shortcuts. Guarded by anyModalOpen so typing in a modal doesn't trigger app actions.
  useKeyboard((key) => {
    if (anyModalOpen && !permissionModalOpen) return;

    if (permissionModalOpen && permissionResolveRef.current) {
      if (key.name === "y" || key.name === "Y") {
        permissionResolveRef.current(true);
        return;
      }
      if (key.name === "n" || key.name === "N") {
        permissionResolveRef.current(false);
        return;
      }
      return;
    }

    if (planApprovalResolveRef.current) {
      if (key.name === "y" || key.name === "Y") {
        planApprovalResolveRef.current("yes");
        return;
      }
      if (key.name === "n" || key.name === "N") {
        planApprovalResolveRef.current("no");
        return;
      }
      if (key.name === "c" || key.name === "C") {
        planApprovalResolveRef.current("comment");
        return;
      }
    }

    if (questionResolveRef.current && questionOptionsRef.current.length > 0) {
      const digit = parseInt(key.name, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= questionOptionsRef.current.length) {
        questionResolveRef.current(questionOptionsRef.current[digit - 1]!);
        return;
      }
    }

    if (key.ctrl && key.name === "c") {
      if (isStreaming) {
        void abort();
      } else if (inputBoxRef.current && !inputBoxRef.current.isInputEmpty()) {
        inputBoxRef.current.clearInput();
      } else {
        setShowExitModal(true);
      }
      return;
    }

    if (key.ctrl && key.name === "p") {
      setShowCommandPanel(true);
      return;
    }

    if (key.ctrl && key.name === "s") {
      if (!isStreaming) {
        void (async () => { await refreshSessionList(); setShowSessionModal(true); })();
      }
      return;
    }

    if (key.ctrl && key.name === "f") {
      if (!isStreaming) {
        setShowForkModal(true);
      }
      return;
    }

    if (key.name === "tab" && key.shift) {
      if (!isStreaming) {
        handleModeSwitch();
      }
      return;
    }

    if (key.ctrl && key.name === "o") {
      const hasExpanded = messages.some(
        (m) =>
          (m.type === "agent" && m.thinking && !m.thinkingCollapsed) ||
          (m.type === "tool_call" && !m.collapsed && isToolExpandable(m.toolName) && !isToolForceExpanded(m.toolName))
      );
      if (hasExpanded) {
        collapseAll();
      } else {
        expandAll();
      }
      return;
    }

    // Ctrl+G: Open external editor for prompt editing
    if (key.ctrl && key.name === "g") {
      if (!isStreaming && !externalEditorBusy) {
        const editorPath = getExternalEditor();
        if (editorPath) {
          // Get current input text
          const inputText = inputBoxRef.current?.getText?.() ?? "";
          // Launch external editor (renderer.suspend() restores terminal state)
          // Use state to pass result back to InputBox via useEffect
          openExternalEditor(renderer, editorPath, inputText, (result, error) => {
            if (result !== null && result.trim()) {
              setExternalEditorResult(result);
            } else if (error) {
              // Show error modal
              setExternalEditorError(error.message);
            }
            setExternalEditorBusy(false);
          });
          setExternalEditorBusy(true);
        } else {
          // No editor configured, open settings modal
          setShowExternalEditorModal(true);
        }
      }
      return;
    }

    // Ctrl+V: Paste image from clipboard (images are handled via clipboard API)
    // Command+V is handled by textarea's onPaste for text and files
    if (key.ctrl && key.name === "v") {
      if (!anyModalOpen && !externalEditorBusy) {
        void handleImagePaste();
      }
      return;
    }

    if (key.name === "pageup") {
      chatPanelRef.current?.scrollUp?.();
      return;
    }
    if (key.name === "pagedown") {
      chatPanelRef.current?.scrollDown?.();
      return;
    }
  });

  const handleSlashEmpty = useCallback(() => {
    setShowCommandPanel(true);
  }, []);

  const handleSelectPrimary = useCallback(
    (model: { provider: string; modelId: string }) => {
      setCurrentModelState(model);
      setCurrentModel(model);
      setShowModelModal(false);
      if (session) {
        const piModel = resolvePiModel(model);
        if (piModel) session.setModel(piModel).catch(() => {});
      }
    },
    [session]
  );

  const handleSelectAuxiliary = useCallback(
    (model: { provider: string; modelId: string }) => {
      setAuxiliaryModelState(model);
      setAuxiliaryModel(model);
      setShowModelModal(false);
    },
    []
  );

  // Render: main layout + modal overlay layer.
  return (
    <box width={width} height={height} flexDirection="column">
      <box width={width} height={height} flexDirection="row">
        {/* Left column */}
        <box width={leftWidth} flexDirection="column">
          {error && (
            <box height={1}>
              <text fg="#ff5555">Error: {error}</text>
            </box>
          )}
          <ChatPanel ref={chatPanelRef} messages={visibleMessages} width={leftWidth} height={chatPanelHeight} isStreaming={isStreaming} onToggleCollapse={toggleCollapse} onImageClick={handleImageClick} />
          {pendingCount > 0 && (
            <PendingArea
              steering={steeringMessages}
              followUp={followUpMessages}
              width={leftWidth}
              onRemove={removePendingMessage}
              onEdit={handleEditPending}
            />
          )}
          <InputBox
            ref={inputBoxRef}
            onSubmit={handleSubmit}
            onQueueSubmit={handleQueueSubmit}
            onSlashEmpty={handleSlashEmpty}
            focused={!anyModalOpen}
            disabled={!isReady || externalEditorBusy}
            disabledHint={externalEditorBusy ? "External editor in use..." : undefined}
            width={leftWidth}
            mode={agentMode}
            isBusy={isStreaming}
            onModeSwitch={handleModeSwitch}
            externalEditorResult={externalEditorResult}
            onExternalEditorResultUsed={() => setExternalEditorResult(undefined)}
            onPaste={handleTextFilePaste}
          />
          <InfoBar width={leftWidth} exitMode={showExitModal} yoloMode={yoloMode} onToggleYolo={() => setYoloMode((prev) => !prev)} />
        </box>

        {/* Divider + Sidebar */}
        <box width={SIDEBAR_WIDTH + 2} flexDirection="row">
          <box width={1} height={height} border={["left"]} borderStyle="single" borderColor="gray" />
          <box width={1} />
          <SideBar
            width={SIDEBAR_WIDTH}
            height={height}
            workingDir={process.cwd()}
            sessionTitle={sessionTitle}
            modelName={modelInfo.modelName}
            provider={modelInfo.provider}
            contextUsage={sidebarContextUsage}
            tokenCount={sidebarTokenCount}
            cost={sidebarCost}
            tasks={tasks}
            subagents={subagents}
            monitors={monitors}
            onOpenCce={() => setShowCceModal(true)}
          />
        </box>
      </box>

      {/* Modals */}
      {showExitModal && (
        <ExitModal
          isActive={showExitModal}
          onConfirm={() => { saveCurrentState(); onExit(); }}
          onCancel={() => setShowExitModal(false)}
        />
      )}

      <CommandPanel isActive={showCommandPanel} onClose={() => setShowCommandPanel(false)} commands={commands} />
      <RenameModal isActive={showRenameModal} currentTitle={sessionTitle} onConfirm={handleRename} onCancel={() => setShowRenameModal(false)} />
      <ConnectModal isActive={showConnectModal} onClose={() => setShowConnectModal(false)} />
      <ModelModal isActive={showModelModal} onClose={() => setShowModelModal(false)} onSelectPrimary={handleSelectPrimary} onSelectAuxiliary={handleSelectAuxiliary} />
      <SessionModal
        isActive={showSessionModal}
        keyboardDisabled={showDeleteConfirm}
        onClose={() => setShowSessionModal(false)}
        sessions={sessionList}
        currentSessionId={currentSessionId}
        currentCwd={process.cwd()}
        onSelect={handleSwitchSession}
        onNewSession={handleNewSession}
        onDelete={handleDeleteRequest}
      />
      {showDeleteConfirm && sessionToDelete && (
        <ConfirmModal
          isActive={showDeleteConfirm}
          title="Delete Session?"
          message={`Are you sure you want to delete "${sessionToDelete.title}"?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
      
      {/* MCP Connection Progress Modal */}
      <ConnectingModal
        isActive={isConnectingMcp}
        progress={mcpConnectionProgress}
      />
      <CceInitModal
        isActive={showCceInitModal}
        message={cceInitMessage}
        downloadProgress={cceInitDownloadProgress}
      />
      <ForkModal
        isActive={showForkModal}
        onClose={() => setShowForkModal(false)}
        session={session}
        onFork={handleFork}
      />
      <ImagePreviewModal isActive={showImageModal} url={imageModalUrl} onClose={handleCloseImageModal} terminalWidth={width} terminalHeight={height} />
      <EditPendingModal
        isActive={showEditPendingModal}
        initialText={editPendingText}
        type={editPendingType ?? "sheer"}
        onConfirm={handleConfirmEditPending}
        onCancel={() => setShowEditPendingModal(false)}
        width={Math.min(70, leftWidth)}
      />
      <MCPSettings
        isActive={showMCPSettings}
        onClose={() => setShowMCPSettings(false)}
        onMcpChange={() => { void refreshMcpTools(session); }}
      />
      <SkillsMenu
        isActive={showSkillsModal}
        onClose={() => setShowSkillsModal(false)}
        skills={skills}
        onInvokeSkill={handleInvokeSkill}
      />
      <ExternalEditorModal
        isActive={showExternalEditorModal}
        onClose={() => setShowExternalEditorModal(false)}
        currentPath={getExternalEditor()}
        onSave={(path) => {
          setExternalEditor(path || null);
          setShowExternalEditorModal(false);
        }}
      />
      <AlertModal
        isActive={externalEditorError !== null}
        title="External Editor Error"
        message={externalEditorError ?? ""}
        onClose={() => setExternalEditorError(null)}
      />
      <AlertModal
        isActive={showModelAlert}
        title="Model Not Configured"
        message={modelAlertMessage}
        onClose={() => setShowModelAlert(false)}
      />
      {showCceModal && (
        <CceModal
          isActive={showCceModal}
          onClose={() => setShowCceModal(false)}
        />
      )}
      <PreferenceModal
        isActive={showPreferenceModal}
        onClose={() => setShowPreferenceModal(false)}
        onShowHooksMessagesChange={(show) => {
          setShowHooksMessagesState(show);
          setShowHooksMessages(show); // Save to settings
        }}
      />
    </box>
  );
}
