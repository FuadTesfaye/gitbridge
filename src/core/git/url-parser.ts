import type { GitProviderType } from "../config/schema";

export interface ParsedRemoteUrl {
  rawUrl: string;
  protocol: "ssh" | "https" | "file" | "unknown";
  providerId: GitProviderType;
  host: string;
  rawHost: string;
  accountAlias?: string;
  owner: string;
  repo: string;
  fullName: string;
}

export function detectProviderType(host: string): GitProviderType {
  const cleanHost = host.toLowerCase();
  if (cleanHost.includes("github.com") || cleanHost === "github") {
    return "github";
  }
  if (cleanHost.includes("gitlab.com") || cleanHost === "gitlab") {
    return "gitlab";
  }
  if (cleanHost.includes("bitbucket.org") || cleanHost === "bitbucket") {
    return "bitbucket";
  }
  if (cleanHost.includes("gitea") || cleanHost.includes("codeberg")) {
    return "gitea";
  }
  return "custom";
}

/**
 * Extracts real host and optional GitBridge account alias from raw host string.
 * Example: github.com-work -> host: github.com, alias: work
 * Example: gitlab.com-personal -> host: gitlab.com, alias: personal
 * Example: my-corp-domain.net -> host: my-corp-domain.net, alias: undefined
 */
function extractHostAndAlias(rawHost: string): { host: string; accountAlias?: string } {
  const knownDomains = [".com-", ".org-", ".net-", ".io-", ".dev-", ".co-"];
  for (const kd of knownDomains) {
    const idx = rawHost.indexOf(kd);
    if (idx !== -1) {
      const extLen = kd.length - 1; // without '-'
      const host = rawHost.substring(0, idx + extLen);
      const accountAlias = rawHost.substring(idx + kd.length);
      if (accountAlias) {
        return { host, accountAlias };
      }
    }
  }

  // Check for short prefixes like github-work or gitlab-personal
  const shortPrefixes = ["github-", "gitlab-", "bitbucket-"];
  for (const sp of shortPrefixes) {
    if (rawHost.startsWith(sp)) {
      const provider = sp.slice(0, -1);
      const host = provider === "bitbucket" ? "bitbucket.org" : `${provider}.com`;
      const accountAlias = rawHost.slice(sp.length);
      return { host, accountAlias };
    }
  }

  return { host: rawHost };
}

export function parseRemoteUrl(url: string): ParsedRemoteUrl | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // 1. Check for scp-like SSH: git@host:owner/repo.git or user@host-alias:owner/repo.git
  const scpMatch = trimmed.match(/^(?:([a-zA-Z0-9._-]+)@)?([^:]+):(.+)$/);
  if (
    scpMatch &&
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("ssh://") &&
    !trimmed.startsWith("file://")
  ) {
    const [, , rawHost, pathPart] = scpMatch;
    const { host, accountAlias } = extractHostAndAlias(rawHost);

    const cleanPath = pathPart.replace(/^\/+/, "").replace(/\.git$/, "");
    const pathSegments = cleanPath.split("/");
    const repo = pathSegments.pop() || "";
    const owner = pathSegments.join("/");

    return {
      rawUrl: trimmed,
      protocol: "ssh",
      providerId: detectProviderType(host),
      host,
      rawHost,
      accountAlias,
      owner,
      repo,
      fullName: owner ? `${owner}/${repo}` : repo,
    };
  }

  // 2. Check for URL with protocol: https://, ssh://, git://, file://
  try {
    const parsed = new URL(trimmed);
    const rawHost = parsed.hostname;
    const { host, accountAlias } = extractHostAndAlias(rawHost);

    let protocol: ParsedRemoteUrl["protocol"] = "unknown";
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      protocol = "https";
    } else if (parsed.protocol === "ssh:" || parsed.protocol === "git+ssh:") {
      protocol = "ssh";
    } else if (parsed.protocol === "file:") {
      protocol = "file";
    }

    const cleanPath = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
    const pathSegments = cleanPath.split("/");
    const repo = pathSegments.pop() || "";
    const owner = pathSegments.join("/");

    return {
      rawUrl: trimmed,
      protocol,
      providerId: detectProviderType(host),
      host,
      rawHost,
      accountAlias,
      owner,
      repo,
      fullName: owner ? `${owner}/${repo}` : repo,
    };
  } catch {
    return null;
  }
}

export function buildSshUrl(host: string, owner: string, repo: string, accountId?: string): string {
  const targetHost = accountId ? `${host}-${accountId}` : host;
  const cleanRepo = repo.endsWith(".git") ? repo : `${repo}.git`;
  return `git@${targetHost}:${owner}/${cleanRepo}`;
}

export function buildHttpsUrl(host: string, owner: string, repo: string): string {
  const cleanRepo = repo.endsWith(".git") ? repo : `${repo}.git`;
  return `https://${host}/${owner}/${cleanRepo}`;
}
