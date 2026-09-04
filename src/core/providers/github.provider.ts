import type {
  GitProvider,
  ProviderUser,
  RemoteRepository,
  HealthCheckResult,
  DeviceCodeResponse,
  ProviderCapabilities,
  RepoAccessCheckResult,
} from "./provider.interface";
import { requestJson } from "@/utils/http";
import { ProviderError } from "@/utils/errors";

const GITHUB_CLIENT_ID = process.env.GITBRIDGE_GITHUB_CLIENT_ID || "Iv1.b507a08c87ecfe98";

export class GitHubProvider implements GitProvider {
  readonly id = "github" as const;
  readonly name = "GitHub";
  readonly defaultHost = "github.com";
  readonly capabilities: ProviderCapabilities = {
    oauth: true,
    deviceCode: true,
    tokenAuth: true,
    passwordAuth: false,
    sshKeys: true,
    selfHosted: true,
  };

  private getApiUrl(host?: string): string {
    const targetHost = host || this.defaultHost;
    if (targetHost === "github.com") {
      return "https://api.github.com";
    }
    if (targetHost.startsWith("http://") || targetHost.startsWith("https://")) {
      return `${targetHost.replace(/\/+$/, "")}/api/v3`;
    }
    // GitHub Enterprise Server
    return `https://${targetHost}/api/v3`;
  }

  async validateToken(token: string, host?: string): Promise<boolean> {
    try {
      const api = this.getApiUrl(host);
      const res = await requestJson(`${api}/user`, "GET", undefined, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getUser(token: string, host?: string): Promise<ProviderUser> {
    const api = this.getApiUrl(host);
    const res = await requestJson<{
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
      message?: string;
    }>(`${api}/user`, "GET", undefined, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status !== 200 || !res.data.login) {
      throw new ProviderError(res.data.message || `Failed to fetch user (status: ${res.status})`, this.name);
    }

    return {
      id: String(res.data.id),
      username: res.data.login,
      displayName: res.data.name || res.data.login,
      email: res.data.email,
      avatarUrl: res.data.avatar_url,
    };
  }

  async listRepositories(token: string, host?: string): Promise<RemoteRepository[]> {
    const api = this.getApiUrl(host);
    const res = await requestJson<
      Array<{
        id: number;
        name: string;
        full_name: string;
        ssh_url: string;
        clone_url: string;
        private: boolean;
        default_branch: string;
        html_url: string;
      }>
    >(`${api}/user/repos?per_page=50&sort=updated`, "GET", undefined, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new ProviderError(`Failed to fetch repositories (status: ${res.status})`, this.name);
    }

    return res.data.map((r) => ({
      id: String(r.id),
      name: r.name,
      fullName: r.full_name,
      sshUrl: r.ssh_url,
      httpsUrl: r.clone_url,
      isPrivate: r.private,
      defaultBranch: r.default_branch || "main",
      htmlUrl: r.html_url,
    }));
  }

  async checkHealth(host?: string): Promise<HealthCheckResult> {
    const api = this.getApiUrl(host);
    const start = Date.now();
    try {
      const res = await requestJson(`${api}/rate_limit`, "GET", undefined, { timeoutMs: 8000 });
      const pingMs = Date.now() - start;
      return {
        apiOk: res.status === 200 || res.status === 401 || res.status === 403,
        pingMs,
        message: "GitHub API reachable",
      };
    } catch (err: unknown) {
      return {
        apiOk: false,
        pingMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async startDeviceFlow(): Promise<DeviceCodeResponse> {
    const res = await requestJson<{
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
      error?: string;
    }>("https://github.com/login/device/code", "POST", {
      client_id: GITHUB_CLIENT_ID,
      scope: "repo,read:user,user:email",
    });

    if (!res.data.device_code) {
      throw new ProviderError(res.data.error || "Failed to start GitHub device flow", this.name);
    }

    return {
      deviceCode: res.data.device_code,
      userCode: res.data.user_code,
      verificationUri: res.data.verification_uri,
      expiresIn: res.data.expires_in,
      interval: res.data.interval || 5,
    };
  }

  async pollDeviceFlow(deviceCode: string, interval = 5): Promise<{ token: string }> {
    const pollIntervalMs = (interval + 1) * 1000;
    const maxAttempts = 60;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const res = await requestJson<{
        access_token?: string;
        error?: string;
        error_description?: string;
      }>("https://github.com/login/oauth/access_token", "POST", {
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });

      if (res.data.access_token) {
        return { token: res.data.access_token };
      }

      if (res.data.error === "authorization_pending") {
        continue;
      }

      if (res.data.error === "slow_down") {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (res.data.error) {
        throw new ProviderError(res.data.error_description || res.data.error, this.name);
      }
    }

    throw new ProviderError("Device authorization timed out.", this.name);
  }

  async checkRepoAccess(
    token: string,
    owner: string,
    repo: string,
    host?: string
  ): Promise<RepoAccessCheckResult> {
    try {
      const api = this.getApiUrl(host);
      const res = await requestJson<{
        permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
      }>(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, "GET", undefined, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (res.status === 200 && res.data) {
        let perm: "read" | "write" | "admin" = "read";
        if (res.data.permissions?.admin) {
          perm = "admin";
        } else if (res.data.permissions?.push) {
          perm = "write";
        }
        return {
          hasAccess: true,
          permission: perm,
          owner,
          repo,
        };
      }
      return { hasAccess: false };
    } catch {
      return { hasAccess: false };
    }
  }
}
