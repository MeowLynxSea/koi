/**
 * SSRF Guard
 *
 * Blocks HTTP hooks from targeting private/link-local IPs.
 */

import { URL } from "url";

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIp(host: string): boolean {
  if (PRIVATE_HOSTNAMES.has(host.toLowerCase())) return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * Check if a URL is allowed for HTTP hooks.
 */
export function isUrlAllowed(
  url: string,
  allowedUrls?: string[]
): boolean {
  // Check allowlist first
  if (allowedUrls && allowedUrls.length > 0) {
    return allowedUrls.some((allowed) => {
      if (url === allowed) return true;
      if (allowed.endsWith("/") && url.startsWith(allowed)) return true;
      return false;
    });
  }

  try {
    const parsed = new URL(url);
    if (isPrivateIp(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
