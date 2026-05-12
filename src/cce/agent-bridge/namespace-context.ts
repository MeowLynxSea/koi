/**
 * Namespace context — auto-resolves cwd → namespace.
 * The agent layer is completely namespace-agnostic.
 */

export class CceNamespaceContext {
  private cache = new Map<string, string>();

  resolve(cwd: string): string {
    if (this.cache.has(cwd)) return this.cache.get(cwd)!;
    const baseName = cwd.split(/[\\/]/).pop() || "default";
    const ns = baseName
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const finalNs = ns || "default";
    this.cache.set(cwd, finalNs);
    return finalNs;
  }

  get current(): string {
    return this.resolve(process.cwd());
  }

  invalidate(cwd: string): void {
    this.cache.delete(cwd);
  }
}

let _instance: CceNamespaceContext | null = null;

export function getNamespaceContext(): CceNamespaceContext {
  if (!_instance) _instance = new CceNamespaceContext();
  return _instance;
}
