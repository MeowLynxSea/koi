/**
 * 工具输出守卫 - 防止工具结果溢出上下文
 *
 * 通过 afterToolCall 钩子自动截断所有工具结果，包括内置工具和 MCP 工具。
 */
import {
  truncateHead,
  truncateTail,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
} from "@mariozechner/pi-coding-agent";
import type {
  AfterToolCallContext,
  AfterToolCallResult,
} from "@mariozechner/pi-agent-core";

// ============================================================================
// 配置
// ============================================================================

/** 截断方向 */
export type TruncateDirection = "head" | "tail";

/** 单个工具的截断限制配置 */
export interface ToolLimitConfig {
  maxLines: number;
  maxBytes: number;
  truncateFrom: TruncateDirection;
}

/** 工具限制配置表 */
export const TOOL_LIMITS: Record<string, ToolLimitConfig> = {
  // 内置工具
  bash: { maxLines: 3000, maxBytes: 100 * 1024, truncateFrom: "tail" },
  read: { maxLines: 2000, maxBytes: 100 * 1024, truncateFrom: "head" },
  grep: { maxLines: 500, maxBytes: 50 * 1024, truncateFrom: "tail" },
  glob: { maxLines: 500, maxBytes: 20 * 1024, truncateFrom: "tail" },
  ls: { maxLines: 500, maxBytes: 20 * 1024, truncateFrom: "tail" },
  write: { maxLines: 0, maxBytes: 0, truncateFrom: "tail" }, // 不截断写入
  // MCP 工具默认配置
  mcp: { maxLines: 1000, maxBytes: 100 * 1024, truncateFrom: "tail" },
};

/** 默认配置（用于未知工具） */
const DEFAULT_LIMITS: ToolLimitConfig = {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
  truncateFrom: "tail",
};

// ============================================================================
// 工具名称提取
// ============================================================================

/**
 * 从工具调用名称中提取工具名（去除命名空间前缀）
 *
 * 例如:
 * - "bash" -> "bash"
 * - "mcp__filesystem__read" -> "mcp"
 * - "read" -> "read"
 */
function extractToolName(toolName: string): string {
  // MCP 工具格式: mcp__<server>__<tool>
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    if (parts.length >= 3) {
      return "mcp";
    }
  }
  return toolName.split(":").pop() ?? toolName;
}

// ============================================================================
// 截断逻辑
// ============================================================================

/**
 * 截断单个文本块
 */
function truncateTextBlock(
  text: string,
  limits: ToolLimitConfig
): { text: string; wasTruncated: boolean; truncatedBy: string | null } {
  // 零限制意味着不截断
  if (limits.maxLines === 0 && limits.maxBytes === 0) {
    return { text, wasTruncated: false, truncatedBy: null };
  }

  const options = {
    maxLines: limits.maxLines || DEFAULT_MAX_LINES,
    maxBytes: limits.maxBytes || DEFAULT_MAX_BYTES,
  };

  const result =
    limits.truncateFrom === "head"
      ? truncateHead(text, options)
      : truncateTail(text, options);

  return {
    text: result.content,
    wasTruncated: result.truncated,
    truncatedBy: result.truncatedBy,
  };
}

/**
 * 工具内容项的联合类型
 */
interface ToolContentItem {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * 截断工具内容数组
 *
 * @param content 工具结果内容
 * @param limits 截断限制
 * @returns 截断后的内容和元数据
 */
export function truncateToolContent(
  content: ToolContentItem[],
  limits: ToolLimitConfig
): {
  content: ToolContentItem[];
  wasTruncated: boolean;
  truncationInfo?: {
    truncatedBy: string;
    totalLines: number;
    outputLines: number;
    totalBytes: number;
    outputBytes: number;
  };
} {
  // 收集所有文本内容
  const textBlocks: { text: string; wasTruncated: boolean; truncatedBy: string | null }[] = [];
  let hasTruncation = false;
  let lastTruncatedBy: string | null = null;

  for (const item of content) {
    if (item.type === "text") {
      const result = truncateTextBlock(item.text ?? "", limits);
      textBlocks.push(result);
      if (result.wasTruncated) {
        hasTruncation = true;
        lastTruncatedBy = result.truncatedBy;
      }
    } else if (item.type === "image") {
      // 图片不截断
      textBlocks.push({ text: `[Image: ${item.data?.length ?? 0} bytes]`, wasTruncated: false, truncatedBy: null });
    }
  }

  if (!hasTruncation) {
    return { content, wasTruncated: false };
  }

  // 构建新的内容数组
  const truncatedContent: ToolContentItem[] = [];
  for (const block of textBlocks) {
    if (block.text) {
      truncatedContent.push({ type: "text", text: block.text });
    }
  }

  return {
    content: truncatedContent,
    wasTruncated: true,
    truncationInfo: {
      truncatedBy: lastTruncatedBy ?? "unknown",
      totalLines: 0, // 不精确计算
      outputLines: 0,
      totalBytes: 0,
      outputBytes: 0,
    },
  };
}

// ============================================================================
// afterToolCall 钩子工厂
// ============================================================================

/**
 * 创建工具输出守卫钩子
 *
 * 此钩子会在每个工具执行完成后自动截断结果，防止上下文溢出。
 *
 * @param customLimits 可选的的自定义限制配置，会合并到默认配置上
 * @returns afterToolCall 钩子函数
 */
export function createToolOutputGuard(
  customLimits?: Partial<Record<string, ToolLimitConfig>>
): (
  context: AfterToolCallContext,
  signal?: AbortSignal
) => Promise<AfterToolCallResult | undefined> {
  // 合并自定义配置
  const limits = { ...TOOL_LIMITS, ...customLimits };

  return async (context): Promise<AfterToolCallResult | undefined> => {
    const { result, toolCall } = context;
    const toolName = extractToolName(toolCall.name);
    const toolLimits = limits[toolName as keyof typeof limits] ?? DEFAULT_LIMITS;

    // 如果该工具不需要截断（maxLines === 0 且 maxBytes === 0），跳过
    if (!toolLimits || toolLimits.maxLines === 0 && toolLimits.maxBytes === 0) {
      return undefined;
    }

    const { content, wasTruncated } = truncateToolContent(
      result.content,
      toolLimits
    );

    if (!wasTruncated) {
      return undefined;
    }

    // 构建截断提示
    const truncateNote = buildTruncationNote(toolName);

    // 将提示追加到内容末尾
    const finalContent: ToolContentItem[] = [...content];

    // 如果最后一个内容块是文本且不是太长，追加到其末尾
    const lastTextBlock = [...finalContent].reverse().find((c): c is { type: "text"; text: string } => c.type === "text");
    if (lastTextBlock) {
      const idx = finalContent.findIndex((c) => c.type === "text" && c.text === lastTextBlock.text);
      if (idx >= 0) {
        finalContent[idx] = {
          type: "text",
          text: `${lastTextBlock.text.trimEnd()}\n\n${truncateNote}`,
        };
      }
    } else {
      finalContent.push({ type: "text", text: truncateNote });
    }

    return {
      content: finalContent as AfterToolCallResult["content"],
    };
  };
}

/**
 * 构建截断提示文本
 */
function buildTruncationNote(toolName: string): string {
  const toolLabel = toolName === "mcp" ? "MCP tool" : `"${toolName}"`;
  return `[Output truncated to prevent context overflow. Set a higher limit or use filters to see more of the ${toolLabel} output.]`;
}

// ============================================================================
// 便捷导出
// ============================================================================

/** MCP 工具的默认限制配置（导出供直接使用） */
export const MCP_TOOL_LIMITS: ToolLimitConfig = TOOL_LIMITS["mcp"]!;
