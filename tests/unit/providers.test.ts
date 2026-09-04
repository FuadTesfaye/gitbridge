import { describe, expect, it } from "bun:test";
import { GitHubProvider } from "@/core/providers/github.provider";
import { GitLabProvider } from "@/core/providers/gitlab.provider";
import { BitbucketProvider } from "@/core/providers/bitbucket.provider";

describe("Providers Unit Tests", () => {
  describe("GitHubProvider", () => {
    const provider = new GitHubProvider();

    it("validates token successfully when API returns 200", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/user")) {
            return new Response(JSON.stringify({ id: 12345, login: "fuadt", name: "Fuad" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const isValid = await provider.validateToken("valid_token");
        expect(isValid).toBe(true);

        const isInvalid = await provider.validateToken("error_token");
        // We can test failure by rejecting
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("retrieves user profile and email", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.endsWith("/user")) {
            return new Response(JSON.stringify({ id: 101, login: "octocat", name: "The Octocat", email: "octo@github.com" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (urlStr.endsWith("/user/emails")) {
            return new Response(JSON.stringify([{ email: "octo@github.com", primary: true, verified: true }]), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const user = await provider.getUser("fake_token");
        expect(user.username).toBe("octocat");
        expect(user.displayName).toBe("The Octocat");
        expect(user.email).toBe("octo@github.com");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("lists repositories for user", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                name: "my-repo",
                full_name: "octocat/my-repo",
                private: false,
                ssh_url: "git@github.com:octocat/my-repo.git",
                clone_url: "https://github.com/octocat/my-repo.git",
                default_branch: "main",
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }) as unknown as typeof fetch;

        const repos = await provider.listRepositories("fake_token");
        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe("my-repo");
        expect(repos[0].sshUrl).toBe("git@github.com:octocat/my-repo.git");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks health status via API ping", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response("Octocat ASCII art", { status: 200 });
        }) as unknown as typeof fetch;

        const health = await provider.checkHealth();
        expect(health.apiOk).toBe(true);

        globalThis.fetch = (async () => {
          throw new Error("GitHub ping failure");
        }) as unknown as typeof fetch;
        const failedHealth = await provider.checkHealth();
        expect(failedHealth.apiOk).toBe(false);
        expect(failedHealth.error).toContain("GitHub ping failure");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks repository access permissions", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/repos/myorg/admin-repo")) {
            return new Response(JSON.stringify({ permissions: { admin: true, push: true, pull: true } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (urlStr.includes("/repos/myorg/write-repo")) {
            return new Response(JSON.stringify({ permissions: { admin: false, push: true, pull: true } }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const adminCheck = await provider.checkRepoAccess("token", "myorg", "admin-repo");
        expect(adminCheck.hasAccess).toBe(true);
        expect(adminCheck.permission).toBe("admin");

        const writeCheck = await provider.checkRepoAccess("token", "myorg", "write-repo");
        expect(writeCheck.hasAccess).toBe(true);
        expect(writeCheck.permission).toBe("write");

        const notFoundCheck = await provider.checkRepoAccess("token", "myorg", "nonexistent");
        expect(notFoundCheck.hasAccess).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("starts device authorization flow", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify({
              device_code: "dev_123",
              user_code: "ABCD-1234",
              verification_uri: "https://github.com/login/device",
              expires_in: 900,
              interval: 5,
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }) as unknown as typeof fetch;

        const flow = await provider.startDeviceFlow();
        expect(flow.deviceCode).toBe("dev_123");
        expect(flow.userCode).toBe("ABCD-1234");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("polls device authorization flow and returns token", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify({
              access_token: "gho_sampletoken12345",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }) as unknown as typeof fetch;

        const res = await provider.pollDeviceFlow("dev_123", -1);
        expect(res.token).toBe("gho_sampletoken12345");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("GitLabProvider", () => {
    const provider = new GitLabProvider();

    it("authenticates via password grant flow", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.endsWith("/oauth/token")) {
            return new Response(JSON.stringify({ access_token: "glpat_mocked_token" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const res = await provider.loginWithPassword("fuadt", "password123");
        expect(res.token).toBe("glpat_mocked_token");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("retrieves user profile and projects", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/api/v4/user")) {
            return new Response(JSON.stringify({ id: 50, username: "gl_user", name: "GL User", email: "gl@corp.com" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (urlStr.includes("/api/v4/projects")) {
            return new Response(
              JSON.stringify([
                {
                  id: 100,
                  name: "core-service",
                  path_with_namespace: "group/core-service",
                  visibility: "private",
                  ssh_url_to_repo: "git@gitlab.com:group/core-service.git",
                  http_url_to_repo: "https://gitlab.com/group/core-service.git",
                  default_branch: "main",
                },
              ]),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const user = await provider.getUser("mock_token");
        expect(user.username).toBe("gl_user");
        expect(user.email).toBe("gl@corp.com");

        const repos = await provider.listRepositories("mock_token");
        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe("core-service");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks repository access permissions on GitLab", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("accessible%2Frepo")) {
            return new Response(
              JSON.stringify({
                permissions: {
                  project_access: { access_level: 40 },
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const check = await provider.checkRepoAccess("token", "accessible", "repo");
        expect(check.hasAccess).toBe(true);
        expect(check.permission).toBe("admin");

        const notFound = await provider.checkRepoAccess("token", "missing", "repo");
        expect(notFound.hasAccess).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks health status via API ping on GitLab", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => new Response("GitLab ping OK", { status: 200 })) as unknown as typeof fetch;
        const health = await provider.checkHealth();
        expect(health.apiOk).toBe(true);

        globalThis.fetch = (async () => {
          throw new Error("GitLab unreachable");
        }) as unknown as typeof fetch;
        const broken = await provider.checkHealth();
        expect(broken.apiOk).toBe(false);
        expect(broken.error).toContain("GitLab unreachable");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("BitbucketProvider", () => {
    const provider = new BitbucketProvider();

    it("retrieves user profile and email from Bitbucket Cloud API", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.endsWith("/2.0/user")) {
            return new Response(
              JSON.stringify({ account_id: "bb_1", username: "bbuser", display_name: "BB User" }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          if (urlStr.endsWith("/2.0/user/emails")) {
            return new Response(
              JSON.stringify({ values: [{ email: "bb@org.com", is_primary: true }] }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const user = await provider.getUser("token");
        expect(user.username).toBe("bbuser");
        expect(user.displayName).toBe("BB User");
        expect(user.email).toBe("bb@org.com");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks repository access on Bitbucket", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("myworkspace/myrepo")) {
            return new Response(JSON.stringify({ slug: "myrepo" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const check = await provider.checkRepoAccess("token", "myworkspace", "myrepo");
        expect(check.hasAccess).toBe(true);
        expect(check.permission).toBe("write");

        const notFound = await provider.checkRepoAccess("token", "myworkspace", "nonexistent");
        expect(notFound.hasAccess).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("lists repositories from Bitbucket Cloud API", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.endsWith("/2.0/user")) {
            return new Response(JSON.stringify({ username: "bbuser" }), { status: 200, headers: { "content-type": "application/json" } });
          }
          if (urlStr.includes("/repositories/bbuser")) {
            return new Response(
              JSON.stringify({
                values: [
                  {
                    uuid: "repo-1",
                    name: "my-cloud-repo",
                    full_name: "bbuser/my-cloud-repo",
                    is_private: true,
                    links: {
                      clone: [{ name: "ssh", href: "git@bitbucket.org:bbuser/my-cloud-repo.git" }],
                    },
                  },
                ],
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        const repos = await provider.listRepositories("token");
        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe("my-cloud-repo");
        expect(repos[0].sshUrl).toContain("git@bitbucket.org:bbuser/my-cloud-repo.git");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("checks Bitbucket health successfully and handles error cleanly", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => new Response("OK", { status: 200 })) as unknown as typeof fetch;
        const healthy = await provider.checkHealth();
        expect(healthy.apiOk).toBe(true);

        globalThis.fetch = (async () => {
          throw new Error("Network unreachable");
        }) as unknown as typeof fetch;
        const broken = await provider.checkHealth();
        expect(broken.apiOk).toBe(false);
        expect(broken.error).toContain("Network unreachable");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
