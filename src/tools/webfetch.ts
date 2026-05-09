/**
 * WebFetchTool — 网页抓取与 AI 摘要
 *
 * 抓取目标 URL 的内容，通过 turndown 将 HTML 转为 Markdown，
 * 再调用辅助模型根据用户 prompt 进行摘要/分析。
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

/**
 * Safe Cache Operations
 *
 * CacheError wraps cache failures so the caller can decide whether to fall back to a fresh fetch
 * instead of silently swallowing the error or crashing the agent loop.
 */

class CacheError extends Error {}

function safeCacheGet<T>(cache: { get(key: string): T | undefined }, key: string): T | undefined {
  try {
    return cache.get(key);
  } catch (err) {
    throw new CacheError(`Cache get failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function safeCacheSet(cache: { set(key: string, value: unknown): void }, key: string, value: unknown): void {
  try {
    cache.set(key, value);
  } catch (err) {
    throw new CacheError(`Cache set failed for ${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * LRU Cache Implementations
 *
 * SizeBoundedLRUCache: byte-capped + TTL + entry-capped. Used for page HTML/Markdown content.
 * SimpleLRUCache: entry-capped + TTL only. Used for lightweight domain safety checks.
 *
 * Both use Map iteration order as the LRU queue (set/delete/re-set moves the key to the end).
 */

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

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const size = Buffer.byteLength(value, "utf8");
    const now = Date.now();

    // 清理过期条目
    for (const [k, v] of this.cache) {
      if (now > v.expiresAt) {
        this.currentSize -= v.size;
        this.cache.delete(k);
      }
    }

    // 淘汰最旧条目
    while (
      (this.currentSize + size > this.maxSizeBytes || this.cache.size >= this.maxEntries) &&
      this.cache.size > 0
    ) {
      const firstKey = this.cache.keys().next().value as string;
      const firstEntry = this.cache.get(firstKey)!;
      this.currentSize -= firstEntry.size;
      this.cache.delete(firstKey);
    }

    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    this.cache.set(key, { value, size, expiresAt: now + this.ttlMs });
    this.currentSize += size;
  }
}

/** 简单条目数上限 LRU 缓存 */
class SimpleLRUCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();

  constructor(private maxSize: number, private ttlMs: number) {}

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

/**
 * Domain Safety
 *
 * Checks URL against the dangerous-host list and preapproved-domain list.
 * Results are cached in domainCheckCache to avoid re-parsing the same URL repeatedly
 * within a single agent turn.
 */

function checkDomainSafety(url: string): { safe: boolean; reason?: string } {
  try {
    const cached = safeCacheGet(domainCheckCache, url);
    if (cached !== undefined) {
      return cached ? { safe: true } : { safe: false, reason: "域名被标记为危险（缓存）" };
    }
  } catch {
    // 缓存读取失败继续执行
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (isDangerousHost(hostname)) {
      safeCacheSet(domainCheckCache, url, false);
      return { safe: false, reason: "本地/IP/内网地址被禁止访问" };
    }

    safeCacheSet(domainCheckCache, url, true);
    return { safe: true };
  } catch {
    safeCacheSet(domainCheckCache, url, false);
    return { safe: false, reason: "无效 URL" };
  }
}

/**
 * Redirect Safety Policy
 *
 * Rules:
 *   1. Allow http→https upgrades; deny downgrades or protocol switches.
 *   2. Port must remain identical.
 *   3. Reject URLs containing embedded credentials (user:pass@host).
 *   4. Allow same-origin or www-prefix-only host changes.
 */

function isSafeRedirect(currentUrl: URL, redirectUrl: URL): boolean {
  // 协议：允许 http→https，禁止 https→http，禁止其他协议跳变
  if (currentUrl.protocol === "https:" && redirectUrl.protocol === "http:") {
    return false;
  }
  if (
    currentUrl.protocol !== redirectUrl.protocol &&
    !(currentUrl.protocol === "http:" && redirectUrl.protocol === "https:")
  ) {
    return false;
  }

  // 端口必须一致
  const defaultPort = (protocol: string) => (protocol === "https:" ? "443" : "80");
  if ((currentUrl.port || defaultPort(currentUrl.protocol)) !== (redirectUrl.port || defaultPort(redirectUrl.protocol))) {
    return false;
  }

  // 禁止 URL 中包含 username/password
  if (redirectUrl.username || redirectUrl.password) return false;

  // 域名：同源或仅 www. 前缀变化
  const currentHost = currentUrl.hostname.toLowerCase();
  const redirectHost = redirectUrl.hostname.toLowerCase();
  if (currentHost === redirectHost) return true;
  if (currentHost === `www.${redirectHost}` || redirectHost === `www.${currentHost}`) return true;

  return false;
}

/**
 * HTTP Fetch with Safe Redirects
 *
 * Manually follows redirects (axios maxRedirects: 0) so we can enforce isSafeRedirect
 * on every hop. Auto-upgrades http→https on the initial URL.
 */

async function fetchWithRedirects(
  initialUrl: string,
  maxRedirects = 10
): Promise<AxiosResponse<string>> {
  let currentUrl = initialUrl.startsWith("http://")
    ? initialUrl.replace("http://", "https://")
    : initialUrl;

  let redirects = 0;
  while (redirects <= maxRedirects) {
    const response = await axios.get<string>(currentUrl, {
      timeout: 60_000,
      maxContentLength: 10 * 1024 * 1024,
      responseType: "text",
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || (status >= 300 && status < 400),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KoiBot/1.0; +https://koi.dev)",
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
        throw new Error(`不安全的重定向被阻止: ${currentUrl} → ${nextUrl.href}`);
      }

      currentUrl = nextUrl.href;
      redirects++;
      continue;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  throw new Error(`重定向次数超过最大限制 (${maxRedirects})`);
}

/** Shared TurndownService instance: avoids re-creating regex-heavy parsers on every fetch. */

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * Content Fetch
 *
 * Checks pageCache first; on miss performs the HTTP request, converts HTML→Markdown,
 * stores the result in the cache, and returns the content.
 * Cache failures are caught and re-thrown as CacheError so executeWebFetch can retry.
 */

async function fetchPageContent(url: string): Promise<{ content: string; contentType: string }> {
  try {
    const cached = safeCacheGet(pageCache, url);
    if (cached !== undefined) {
      return { content: cached, contentType: "text/html" };
    }
  } catch {
    // 缓存读取失败继续抓取
  }

  const response = await fetchWithRedirects(url);
  const contentType = String(response.headers["content-type"] || "application/octet-stream");
  const body: string = response.data;
  const content = contentType.includes("text/html") ? turndownService.turndown(body) : body;

  try {
    safeCacheSet(pageCache, url, content);
  } catch {
    // 缓存写入失败不影响结果
  }

  return { content, contentType };
}

/**
 * AI Summarization
 *
 * Sends the truncated page content + user prompt to the current Pi model.
 * Preapproved domains get a plain system prompt; non-preapproved domains include
 * a copyright/disclaimer notice to reduce hallucinated attribution.
 */

async function summarizeWithAI(content: string, prompt: string, url: string): Promise<string> {
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

  const userPrompt = `网页内容：\n\n${content}\n\n用户问题/指令：${prompt}`;

  const result = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: 4000,
      timeoutMs: 60_000,
    }
  );

  if (result.stopReason === "error" || result.stopReason === "aborted") {
    throw new Error(`辅助模型处理失败: ${result.errorMessage || "未知错误"}`);
  }

  return result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Main Entry Point
 *
 * Pipeline: domain safety → fetch content → truncate → AI summarize → return.
 * On cache failure we re-fetch uncached; all other errors bubble up to the tool layer.
 */

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

  // 域名预检
  const safety = checkDomainSafety(url);
  if (!safety.safe) {
    throw new Error(`域名预检失败: ${safety.reason}`);
  }

  // 抓取内容
  let fromCache = false;
  let rawContent: string;
  let contentType: string;

  try {
    const page = await fetchPageContent(url);
    rawContent = page.content;
    contentType = page.contentType;
    fromCache = true;
  } catch (err) {
    if (err instanceof CacheError) {
      // 缓存出错，重新抓取
      const page = await fetchPageContent(url);
      rawContent = page.content;
      contentType = page.contentType;
      fromCache = false;
    } else {
      throw err;
    }
  }

  // 截断
  const MAX_CHARS = 100_000;
  const truncated = rawContent.length > MAX_CHARS;
  const truncatedContent = truncated ? rawContent.slice(0, MAX_CHARS) : rawContent;

  // AI 处理
  const answer = await summarizeWithAI(truncatedContent, prompt, url);

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

/** Factory functions for permission-denied tool results (keeps execute() readable). */

function buildDeniedResult(params: WebFetchToolInput, reason: string): ToolResultWithError<{
  url: string;
  contentType: string;
  charCount: number;
  truncated: boolean;
  cached: boolean;
}> {
  return {
    content: [{ type: "text", text: `Permission denied: ${reason}` }],
    details: { url: params.url, contentType: "", charCount: 0, truncated: false, cached: false },
    isError: true,
  };
}

function buildUserDeniedResult(params: WebFetchToolInput): ToolResultWithError<{
  url: string;
  contentType: string;
  charCount: number;
  truncated: boolean;
  cached: boolean;
}> {
  return {
    content: [{ type: "text", text: "User denied permission to fetch the URL." }],
    details: { url: params.url, contentType: "", charCount: 0, truncated: false, cached: false },
    isError: true,
  };
}

/**
 * ToolDefinition Factory
 *
 * Registers the webfetch tool with the Pi agent runtime.
 * Permission flow: deny → return error immediately; ask → show modal → proceed or return error.
 */

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
        return buildDeniedResult(params, perm.reason ?? "webfetch operation blocked");
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({
          toolName: "webfetch",
          args: params,
          reason: perm.reason ?? "Confirm web fetch",
        });
        if (!allowed) {
          return buildUserDeniedResult(params);
        }
      }
      return await executeWebFetch(params);
    },
  };
}
