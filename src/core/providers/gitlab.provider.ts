import type {
  GitProvider,
  ProviderUser,
  RemoteRepository,
  HealthCheckResult,
} from "./provider.interface";
import { requestJson } from "@/utils/http";
import { ProviderError } from "@/utils/errors";

export class GitLabProvider implements GitProvider {
  readonly id = "gitlab" as const;
  readonly name = "GitLab";
  readonly defaultHost = "gitlab.com";

  private getApiUrl(host?: string): string {
    const targetHost = host || this.defaultHost;
    return `https://${targetHost}/api/v4`;
  }

  private getAuthHeader(token: string): Record<string, string> {
    // GitLab tokens starting with glpat- or standard PATs can use PRIVATE-TOKEN or Bearer
    if (token.startsWith("glpat-") || token.length < 30) {
      return { "PRIVATE-TOKEN": token };
    }
    return { Authorization: `Bearer ${token}` };
  }

  async validateToken(token: string, host?: string): Promise<boolean> {
    try {
      const api = this.getApiUrl(host);
      const res = await requestJson(`${api}/user`, "GET", undefined, {
        headers: this.getAuthHeader(token),
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
      username: string;
      name?: string;
      email?: string;
      avatar_url?: string;
      message?: string;
    }>(`${api}/user`, "GET", undefined, {
      headers: this.getAuthHeader(token),
    });

    if (res.status !== 200 || !res.data.username) {
      throw new ProviderError(res.data.message || `Failed to fetch GitLab user (status: ${res.status})`, this.name);
    }

    return {
      id: String(res.data.id),
      username: res.data.username,
      displayName: res.data.name || res.data.username,
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
        path_with_namespace: string;
        ssh_url_to_repo: string;
        http_url_to_repo: string;
        visibility: string;
        default_branch: string;
        web_url: string;
      }>
    >(`${api}/projects?membership=true&simple=true&per_page=50&order_by=updated_at`, "GET", undefined, {
      headers: this.getAuthHeader(token),
    });

    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new ProviderError(`Failed to fetch GitLab projects (status: ${res.status})`, this.name);
    }

    return res.data.map((r) => ({
      id: String(r.id),
      name: r.name,
      fullName: r.path_with_namespace,
      sshUrl: r.ssh_url_to_repo,
      httpsUrl: r.http_url_to_repo,
      isPrivate: r.visibility === "private",
      defaultBranch: r.default_branch || "main",
      htmlUrl: r.web_url,
    }));
  }

  async checkHealth(host?: string): Promise<HealthCheckResult> {
    const api = this.getApiUrl(host);
    const start = Date.now();
    try {
      const res = await requestJson(`${api}/version`, "GET", undefined, { timeoutMs: 8000 });
      const pingMs = Date.now() - start;
      return {
        apiOk: res.status === 200 || res.status === 401, // 401 means API endpoint reached but unauthenticated
        pingMs,
        message: "GitLab API reachable",
      };
    } catch (err: unknown) {
      return {
        apiOk: false,
        pingMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
