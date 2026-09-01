import { GitCliError } from "@/utils/errors";
import { parseRemoteUrl, type ParsedRemoteUrl } from "./url-parser";

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  parsedFetch: ParsedRemoteUrl | null;
  parsedPush: ParsedRemoteUrl | null;
}

export class GitCli {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  getCwd(): string {
    return this.cwd;
  }

  async exec(args: string[], options: { cwd?: string; allowFailure?: boolean; env?: Record<string, string> } = {}): Promise<GitExecResult> {
    const targetCwd = options.cwd ?? this.cwd;
    try {
      const proc = Bun.spawn(["git", ...args], {
        cwd: targetCwd,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, ...options.env },
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      if (exitCode !== 0 && !options.allowFailure) {
        throw new GitCliError(
          stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`,
          exitCode,
          stderr.trim()
        );
      }

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
      };
    } catch (err: unknown) {
      if (err instanceof GitCliError) throw err;
      throw new GitCliError(
        `Failed to run 'git ${args.join(" ")}': ${err instanceof Error ? err.message : String(err)}`,
        1,
        String(err)
      );
    }
  }

  async isGitRepo(): Promise<boolean> {
    try {
      const res = await this.exec(["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
      return res.exitCode === 0 && res.stdout === "true";
    } catch {
      return false;
    }
  }

  async getRepoRoot(): Promise<string | null> {
    try {
      const res = await this.exec(["rev-parse", "--show-toplevel"], { allowFailure: true });
      if (res.exitCode === 0 && res.stdout) {
        return res.stdout.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  async getConfig(key: string, scope?: "local" | "global" | "system"): Promise<string | null> {
    const args = ["config"];
    if (scope) args.push(`--${scope}`);
    args.push("--get", key);

    const res = await this.exec(args, { allowFailure: true });
    if (res.exitCode === 0 && res.stdout) {
      return res.stdout.trim();
    }
    return null;
  }

  async setConfig(key: string, value: string, scope: "local" | "global" = "local"): Promise<void> {
    await this.exec(["config", `--${scope}`, key, value]);
  }

  async unsetConfig(key: string, scope: "local" | "global" = "local"): Promise<void> {
    await this.exec(["config", `--${scope}`, "--unset", key], { allowFailure: true });
  }

  async getRemotes(): Promise<GitRemoteInfo[]> {
    const res = await this.exec(["remote", "-v"], { allowFailure: true });
    if (res.exitCode !== 0 || !res.stdout) return [];

    const lines = res.stdout.split("\n");
    const remoteMap = new Map<string, { fetchUrl: string; pushUrl: string }>();

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        const [, name, url, type] = match;
        const current = remoteMap.get(name) || { fetchUrl: "", pushUrl: "" };
        if (type === "fetch") current.fetchUrl = url;
        if (type === "push") current.pushUrl = url;
        remoteMap.set(name, current);
      }
    }

    const result: GitRemoteInfo[] = [];
    for (const [name, urls] of remoteMap.entries()) {
      result.push({
        name,
        fetchUrl: urls.fetchUrl,
        pushUrl: urls.pushUrl,
        parsedFetch: parseRemoteUrl(urls.fetchUrl),
        parsedPush: parseRemoteUrl(urls.pushUrl),
      });
    }

    return result;
  }

  async setRemoteUrl(name: string, url: string): Promise<void> {
    const remotes = await this.getRemotes();
    const exists = remotes.some((r) => r.name === name);
    if (exists) {
      await this.exec(["remote", "set-url", name, url]);
    } else {
      await this.exec(["remote", "add", name, url]);
    }
  }

  async getCurrentBranch(): Promise<string | null> {
    const res = await this.exec(["branch", "--show-current"], { allowFailure: true });
    if (res.exitCode === 0 && res.stdout) {
      return res.stdout.trim();
    }
    return null;
  }

  async getGitVersion(): Promise<string | null> {
    const res = await this.exec(["--version"], { allowFailure: true });
    if (res.exitCode === 0 && res.stdout) {
      const match = res.stdout.match(/git version ([\d.]+)/);
      return match ? match[1] : res.stdout;
    }
    return null;
  }
}
