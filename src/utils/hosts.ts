/**
 * Hostname comparison helpers. Never use String.includes() for host matching —
 * "github.com.attacker.tld".includes("github.com") is true.
 */

/**
 * Only the HTTPS default port is dropped. GitBridge never sends credentials
 * over cleartext HTTP, and any other port names a different service on the
 * same machine (git.corp:8443 is not git.corp), so it stays part of the host.
 */
const DEFAULT_PORT_SUFFIX = ":443";

export function normalizeHost(host: string): string {
  if (!host || typeof host !== "string") return "";
  let h = host.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.replace(/\/.*$/, "");
  if (h.endsWith(DEFAULT_PORT_SUFFIX)) {
    h = h.slice(0, -DEFAULT_PORT_SUFFIX.length);
  }
  h = h.replace(/^\.+|\.+$/g, "");
  return h;
}

export function hostsEqual(a: string, b: string): boolean {
  const left = normalizeHost(a);
  const right = normalizeHost(b);
  return left.length > 0 && left === right;
}

/**
 * True when `host` is exactly `base` or a subdomain of `base`
 * (e.g. gist.github.com of github.com). Rejects github.com.evil.com.
 */
export function hostMatchesBase(host: string, base: string): boolean {
  const h = normalizeHost(host);
  const b = normalizeHost(base);
  if (!h || !b) return false;
  return h === b || h.endsWith(`.${b}`);
}

export function detectCloudProviderFromHost(
  host: string
): "github" | "gitlab" | "bitbucket" | null {
  const h = normalizeHost(host);
  if (!h) return null;
  if (h === "github.com" || h.endsWith(".github.com") || h === "github") return "github";
  if (h === "gitlab.com" || h.endsWith(".gitlab.com") || h === "gitlab") return "gitlab";
  if (
    h === "bitbucket.org" ||
    h.endsWith(".bitbucket.org") ||
    h === "bitbucket.com" ||
    h.endsWith(".bitbucket.com") ||
    h === "bitbucket"
  ) {
    return "bitbucket";
  }
  return null;
}

export function textContainsHost(text: string, base: string): boolean {
  const b = normalizeHost(base);
  if (!text || !b) return false;
  const tokens = text.toLowerCase().split(/[^a-z0-9.-]+/);
  return tokens.some((t) => hostMatchesBase(t, b));
}

export function isHttpUrl(value: string): boolean {
  return /^http:\/\//i.test(value.trim());
}

export function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value.trim());
}
