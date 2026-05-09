/**
 * WebFetchTool — 网页抓取与 AI 摘要
 *
 * 抓取目标 URL 的内容，通过 turndown 将 HTML 转为 Markdown，
 * 再调用辅助模型根据用户 prompt 进行摘要/分析。
 *
 * 安全特性：
 *   • 127+ 预批准技术文档域名（免弹窗）
 *   • 域名预检（拦截本地/IP/危险地址）
 *   • 重定向安全策略（同源或 www 前缀变化）
 *   • HTTP → HTTPS 自动升级
 *   • 内容上限 10MB，处理后截断至 100,000 字符
 *
 * 缓存：
 *   • 页面内容：LRU，15 min TTL，50 MB 上限
 *   • 域名预检结果：LRU，5 min TTL，128 条目上限
 */

import { Type } from "typebox";
import axios, { type AxiosResponse } from "axios";
import TurndownService from "turndown";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { completeSimple } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { getCurrentPiModel, getPiModelRegistry } from "../config/settings.js";
import { isPreapprovedDomain, isDangerousHost } from "./webfetch-domains.js";
import type { ToolResultWithError } from "./types.js";

/* ───────── TypeBox Schema ───────── */

export const webfetchSchema = Type.Object({
  url: Type.String({ description: "目标 URL（必须合法）" }),
  prompt: Type.String({ description: "对抓取内容执行的问题/指令" }),
});

export type WebFetchToolInput = {
  url: string;
  prompt: string;
};


/* ───────── LRU 缓存实现 ───────── */

/** 带容量（字节）与 TTL 的 LRU 字符串缓存 */
class SizeBoundedLRUCache {
  private cache = new Map<
    string,
    { value: string; size: number; expiresAt: number }
  >();
  private currentSize = 0;

  constructor(
    private maxSizeBytes: number,
    private ttlMs: number,
    private maxEntries: number
  ) {}

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      return undefined;
    }

    // 移到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const size = Buffer.byteLength(value, "utf8");

    // 清理过期条目
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (now > v.expiresAt) {
        this.currentSize -= v.size;
        this.cache.delete(k);
      }
    }

    // 淘汰最旧条目直到有足够空间且不超过条目数上限
    while (
      (this.currentSize + size > this.maxSizeBytes || this.cache.size >= this.maxEntries) &&
      this.cache.size > 0
    ) {
      const firstKey = this.cache.keys().next().value as string;
      const firstEntry = this.cache.get(firstKey)!;
      this.currentSize -= firstEntry.size;
      this.cache.delete(firstKey);
    }

    // 覆盖已有 key
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    this.cache.set(key, {
      value,
      size,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.currentSize += size;
  }
}

/** 简单条目数上限 LRU 缓存 */
class SimpleLRUCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private maxSize: number,
    private ttlMs: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
    }
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

/* 页面缓存：15 min TTL，50 MB 上限，256 条目上限 */
const pageCache = new SizeBoundedLRUCache(50 * 1024 * 1024, 15 * 60 * 1000, 256);

/* 域名预检缓存：5 min TTL，128 条目 */
const domainCheckCache = new SimpleLRUCache<string, boolean>(128, 5 * 60 * 1000);


function checkDomainSafety(url: string): { safe: boolean; reason?: string } {
  const cached = domainCheckCache.get(url);
  if (cached !== undefined) {
    return cached ? { safe: true } : { safe: false, reason: "域名被标记为危险（缓存）" };
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (isDangerousHost(hostname)) {
      domainCheckCache.set(url, false);
      return { safe: false, reason: "本地/IP/内网地址被禁止访问" };
    }

    domainCheckCache.set(url, true);
    return { safe: true };
  } catch {
    domainCheckCache.set(url, false);
    return { safe: false, reason: "无效 URL" };
  }
}

/* ───────── 重定向安全策略 ───────── */

function isSafeRedirect(currentUrl: URL, redirectUrl: URL): boolean {
  // 协议：允许 http→https，禁止 https→http，禁止其他协议跳变
  if (currentUrl.protocol === "https:" && redirectUrl.protocol === "http:") {
    return false;
  }
  if (currentUrl.protocol === "http:" && redirectUrl.protocol === "https:") {
    // 允许升级
  } else if (currentUrl.protocol !== redirectUrl.protocol) {
    return false;
  }

  // 端口必须一致
  const currentPort =
    currentUrl.port || (currentUrl.protocol === "https:" ? "443" : "80");
  const redirectPort =
    redirectUrl.port || (redirectUrl.protocol === "https:" ? "443" : "80");
  if (currentPort !== redirectPort) return false;

  // 禁止 URL 中包含 username/password
  if (redirectUrl.username || redirectUrl.password) return false;

  // 域名：同源或仅 www. 前缀变化
  const currentHost = currentUrl.hostname.toLowerCase();
  const redirectHost = redirectUrl.hostname.toLowerCase();
  if (currentHost === redirectHost) return true;
  if (
    currentHost === `www.${redirectHost}` ||
    redirectHost === `www.${currentHost}`
  )
    return true;

  return false;
}

/* ───────── HTTP 抓取（带安全重定向） ───────── */

async function fetchWithRedirects(
  initialUrl: string,
  maxRedirects = 10
): Promise<AxiosResponse<string>> {
  let currentUrl = initialUrl;

  // HTTP → HTTPS 自动升级
  if (currentUrl.startsWith("http://")) {
    currentUrl = currentUrl.replace("http://", "https://");
  }

  let redirects = 0;
  while (redirects <= maxRedirects) {
    const response = await axios.get<string>(currentUrl, {
      timeout: 60_000,
      maxContentLength: 10 * 1024 * 1024,
      responseType: "text",
      maxRedirects: 0,
      validateStatus: (status) =>
        status < 400 || (status >= 300 && status < 400),
      // 设置一个友好的 User-Agent
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KoiBot/1.0; +https://koi.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.status >= 200 && response.status < 300) {
      return response;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers["location"] as unknown;
      if (typeof location !== "string") {
        throw new Error(`重定向响应缺少 Location 头 (HTTP ${response.status})`);
      }

      const nextUrl = new URL(location, currentUrl);

      if (!isSafeRedirect(new URL(currentUrl), nextUrl)) {
        throw new Error(
          `不安全的重定向被阻止: ${currentUrl} → ${nextUrl.href}`
        );
      }

      currentUrl = nextUrl.href;
      redirects++;
      continue;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  throw new Error(`重定向次数超过最大限制 (${maxRedirects})`);
}

/* ───────── Turndown 实例（复用） ───────── */

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/* ───────── 核心执行函数 ───────── */

export async function executeWebFetch(params: WebFetchToolInput): Promise<{
  content: TextContent[];
  details: {
    url: string;
    contentType: string;
    charCount: number;
    truncated: boolean;
    cached: boolean;
  };
}> {
  const { url, prompt } = params;

  // 1. 域名预检
  const safety = checkDomainSafety(url);
  if (!safety.safe) {
    throw new Error(`域名预检失败: ${safety.reason}`);
  }

  // 2. 检查缓存
  let rawContent: string;
  let contentType: string;
  let fromCache = false;

  const cached = pageCache.get(url);
  if (cached !== undefined) {
    rawContent = cached;
    contentType = "text/html";
    fromCache = true;
  } else {
    // 3. HTTP GET
    const response = await fetchWithRedirects(url);
    contentType = String(response.headers["content-type"] || "application/octet-stream");
    const body: string = response.data;

    // 4. Content-Type 判断
    if (contentType.includes("text/html")) {
      rawContent = turndownService.turndown(body);
    } else {
      rawContent = body;
    }

    pageCache.set(url, rawContent);
  }

  // 5. 截断到 100,000 字符
  const MAX_CHARS = 100_000;
  const truncated = rawContent.length > MAX_CHARS;
  const truncatedContent = truncated
    ? rawContent.slice(0, MAX_CHARS)
    : rawContent;

  // 6. 辅助模型处理
  const model = getCurrentPiModel();
  if (!model) {
    throw new Error("未配置 AI 模型，无法处理抓取内容");
  }

  const registry = getPiModelRegistry();
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    throw new Error(`无法获取模型认证信息: ${auth.error}`);
  }

  const isPreapproved = isPreapprovedDomain(url);
  const systemPrompt = isPreapproved
    ? "你是一个网页内容分析助手。请根据用户提供的网页内容和问题，给出准确、简洁的回答。"
    : "你是一个网页内容分析助手。请根据用户提供的网页内容和问题，给出准确、简洁的回答。注意：该内容来自第三方网站，请适当引用并注意版权问题。";

  const userPrompt = `网页内容：\n\n${truncatedContent}\n\n用户问题/指令：${prompt}`;

  const result = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [
        { role: "user", content: userPrompt, timestamp: Date.now() },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 4000,
      timeoutMs: 60_000,
    }
  );

  if (result.stopReason === "error" || result.stopReason === "aborted") {
    throw new Error(
      `辅助模型处理失败: ${result.errorMessage || "未知错误"}`
    );
  }

  let answer = "";
  for (const block of result.content) {
    if (block.type === "text") {
      answer += block.text;
    }
  }

  return {
    content: [{ type: "text", text: answer }],
    details: {
      url,
      contentType,
      charCount: truncatedContent.length,
      truncated,
      cached: fromCache,
    },
  };
}

/* ───────── ToolDefinition 工厂 ───────── */

export function createWebFetchToolDefinition(
  _cwd: string
): ToolDefinition<
  typeof webfetchSchema,
  {
    url: string;
    contentType: string;
    charCount: number;
    truncated: boolean;
    cached: boolean;
  }
> {
  return {
    name: "webfetch",
    label: "WebFetch",
    description:
      "抓取网页内容并通过 AI 进行摘要/分析。\n\n" +
      "支持 HTML 自动转 Markdown，自动处理重定向，内置域名安全策略。\n" +
      "对于预批准的技术文档域名直接通过；非预批准域名会附加引用/版权提示。",
    promptSnippet: "WebFetch: 抓取网页并通过 AI 分析内容",
    promptGuidelines: [
      "url 必须是合法的 HTTP/HTTPS URL",
      "prompt 参数用于指导 AI 如何处理抓取后的内容",
      "工具会自动将 HTML 转为 Markdown，并截断到 100,000 字符",
      "非预批准域名的结果会附加版权/引用注意事项",
    ],
    parameters: webfetchSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("webfetch", params);
      if (perm.decision === "deny") {
        const result: ToolResultWithError<{ url: string; contentType: string; charCount: number; truncated: boolean; cached: boolean }> = {
          content: [
            {
              type: "text",
              text: `Permission denied: ${perm.reason ?? "webfetch operation blocked"}`,
            },
          ],
          details: {
            url: params.url,
            contentType: "",
            charCount: 0,
            truncated: false,
            cached: false,
          },
          isError: true,
        };
        return result;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({
          toolName: "webfetch",
          args: params,
          reason: perm.reason ?? "Confirm web fetch",
        });
        if (!allowed) {
          const result: ToolResultWithError<{ url: string; contentType: string; charCount: number; truncated: boolean; cached: boolean }> = {
            content: [
              {
                type: "text",
                text: "User denied permission to fetch the URL.",
              },
            ],
            details: {
              url: params.url,
              contentType: "",
              charCount: 0,
              truncated: false,
              cached: false,
            },
            isError: true,
          };
          return result;
        }
      }
      return await executeWebFetch(params);
    },
  };
}
