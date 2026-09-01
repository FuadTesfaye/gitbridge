import type {
  GitProvider,
  ProviderUser,
  RemoteRepository,
  HealthCheckResult,
} from "./provider.interface";
import { requestJson } from "@/utils/http";
import { ProviderError } from "@/utils/errors";

export class BitbucketProvider implements GitProvider {
  readonly id = "bitbucket" as const;
  readonly name = "Bitbucket";
  readonly defaultHost = "bitbucket.org";

  private getApiUrl(host?: string): string {
    const targetHost = host || this.defaultHost;
    if (targetHost === "bitbucket.org") {
      return "https://api.bitbucket.org/2.0";
    }
    // Bitbucket Server / Data Center
    return `https://${targetHost}/rest/api/1.0`;
  }

  private getAuthHeader(token: string): Record<string, string> {
    if (token.includes(":")) {
      // Username:AppPassword format
      const encoded = Buffer.from(token).toString("base64");
      return { Authorization: `Basic ${encoded}` };
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
      account_id?: string;
      uuid?: string;
      username?: string;
      display_name?: string;
      links?: { avatar?: { href?: string } };
      error?: { message?: string };
    }>(`${api}/user`, "GET", undefined, {
      headers: this.getAuthHeader(token),
    });

    if (res.status !== 200 || (!res.data.username && !res.data.display_name)) {
      throw new ProviderError(res.data.error?.message || `Failed to fetch Bitbucket user`, this.name);
    }

    const username = res.data.username || res.data.display_name?.replace(/\s+/g, "").toLowerCase() || "user";
    return {
      id: res.data.account_id || res.data.uuid || username,
      username,
      displayName: res.data.display_name || username,
      avatarUrl: res.data.links?.avatar?.href,
    };
  }

  async listRepositories(token: string, host?: string): Promise<RemoteRepository[]> {
    const user = await this.getUser(token, host);
    const api = this.getApiUrl(host);
    const res = await requestJson<{
      values?: Array<{
        uuid: string;
        name: string;
        full_name: string;
        is_private: boolean;
        mainbranch?: { name: string };
        links?: {
          html?: { href: string };
          clone?: Array<{ name: string; href: string }>;
        };
      }>;
    }>(`${api}/repositories/${user.username}?pagelen=50&sort=-updated_on`, "GET", undefined, {
      headers: this.getAuthHeader(token),
    });

    if (res.status !== 200 || !res.data.values) {
      return [];
    }

    return res.data.values.map((r) => {
      const sshClone = r.links?.clone?.find((c) => c.name === "ssh")?.href || `git@bitbucket.org:${r.full_name}.git`;
      const httpsClone = r.links?.clone?.find((c) => c.name === "https")?.href || `https://bitbucket.org/${r.full_name}.git`;
      return {
        id: r.uuid,
        name: r.name,
        fullName: r.full_name,
        sshUrl: sshClone,
        httpsUrl: httpsClone,
        isPrivate: r.is_private,
        defaultBranch: r.mainbranch?.name || "main",
        htmlUrl: r.links?.html?.href,
      };
    });
  }

  async checkHealth(host?: string): Promise<HealthCheckResult> {
    const api = this.getApiUrl(host);
    const start = Date.now();
    try {
      const res = await requestJson(`${api}/user`, "GET", undefined, { timeoutMs: 8000 });
      const pingMs = Date.now() - start;
      return {
        apiOk: res.status === 200 || res.status === 401,
        pingMs,
        message: "Bitbucket API reachable",
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
