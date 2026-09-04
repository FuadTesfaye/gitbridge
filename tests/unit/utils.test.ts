import { describe, expect, it } from "bun:test";
import {
  GitBridgeError,
  ConfigError,
  AuthError,
  ProviderError,
  GitCliError,
  CredentialStoreError,
} from "@/utils/errors";
import { redactSecret, sanitizeConfigString, getMachineHardwareId } from "@/utils/security";
import { expandTilde, isWindows, isMacOS, isLinux, getHomeDir } from "@/utils/platform";
import { requestJson } from "@/utils/http";

describe("Utils Unit Tests", () => {
  describe("Errors", () => {
    it("instantiates error classes with expected names, codes, and messages", () => {
      const baseErr = new GitBridgeError("base error", "BASE_ERR");
      expect(baseErr.name).toBe("GitBridgeError");
      expect(baseErr.code).toBe("BASE_ERR");
      expect(baseErr.message).toBe("base error");

      const configErr = new ConfigError("config failed");
      expect(configErr.name).toBe("ConfigError");
      expect(configErr.code).toBe("CONFIG_ERROR");
      expect(configErr instanceof GitBridgeError).toBe(true);

      const authErr = new AuthError("auth failed");
      expect(authErr.name).toBe("AuthError");
      expect(authErr.code).toBe("AUTH_ERROR");

      const provErr = new ProviderError("rate limit", "github");
      expect(provErr.name).toBe("ProviderError");
      expect(provErr.provider).toBe("github");
      expect(provErr.message).toContain("[github] rate limit");

      const cliErr = new GitCliError("fatal: not a git repo", 128, "fatal: not a git repo");
      expect(cliErr.name).toBe("GitCliError");
      expect(cliErr.exitCode).toBe(128);
      expect(cliErr.stderr).toBe("fatal: not a git repo");

      const credErr = new CredentialStoreError("vault locked");
      expect(credErr.name).toBe("CredentialStoreError");
      expect(credErr.code).toBe("CREDENTIAL_STORE_ERROR");
    });
  });

  describe("Security Utils", () => {
    it("redacts sensitive secrets correctly", () => {
      expect(redactSecret("")).toBe("");
      expect(redactSecret("short")).toBe("********");
      expect(redactSecret("ghp_1234567890abcdefghijklmnopqrstuvwxyz")).toBe("ghp_123...wxyz");
    });

    it("sanitizes config strings to prevent CRLF injection", () => {
      expect(sanitizeConfigString("")).toBe("");
      expect(sanitizeConfigString("safe-value")).toBe("safe-value");
      expect(sanitizeConfigString("dangerous\r\ninjected\0value\n")).toBe("dangerousinjectedvalue");
    });

    it("retrieves a machine hardware identifier string", () => {
      const id = getMachineHardwareId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^(linux-machine-id|darwin-uuid|win-guid|fallback-machine):/);
    });
  });

  describe("Platform Utils", () => {
    it("expands tilde paths correctly", () => {
      const home = getHomeDir();
      expect(expandTilde("~/projects")).toBe(`${home}/projects`);
      expect(expandTilde("/absolute/path")).toBe("/absolute/path");
    });

    it("returns platform booleans matching process.platform", () => {
      if (process.platform === "linux") {
        expect(isLinux()).toBe(true);
        expect(isWindows()).toBe(false);
        expect(isMacOS()).toBe(false);
      } else if (process.platform === "darwin") {
        expect(isMacOS()).toBe(true);
        expect(isWindows()).toBe(false);
      } else if (process.platform === "win32") {
        expect(isWindows()).toBe(true);
      }
    });
  });

  describe("HTTP Utils", () => {
    it("handles query params and serializes requests properly", async () => {
      // Mock global fetch for testing requestJson
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = url.toString();
          if (urlStr.includes("timeout")) {
            const err = new Error("Abort");
            err.name = "AbortError";
            throw err;
          }
          return new Response(JSON.stringify({ success: true, requestedUrl: urlStr }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as unknown as typeof fetch;

        const res = await requestJson<{ success: boolean; requestedUrl: string }>("https://api.example.com/test", "GET", undefined, {
          params: { page: 1, query: "search terms", empty: undefined },
        });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.requestedUrl).toContain("page=1");
        expect(res.data.requestedUrl).toContain("query=search+terms");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles post requests with object body and non-json responses", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
          return new Response("plain text response", {
            status: 201,
            headers: { "content-type": "text/plain" },
          });
        }) as unknown as typeof fetch;

        const res = await requestJson<string>("https://api.example.com/post", "POST", { key: "value" });
        expect(res.status).toBe(201);
        expect(res.data).toBe("plain text response");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles abort timeout errors", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          const err = new Error("Abort");
          err.name = "AbortError";
          throw err;
        }) as unknown as typeof fetch;

        expect(requestJson("https://api.example.com/timeout", "GET", undefined, { timeoutMs: 100 })).rejects.toThrow("timed out");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Proc & Process Utils", () => {
    it("executes command cleanly with stdout output", async () => {
      const { execProcess } = await import("@/utils/proc");
      const res = await execProcess("echo", ["hello gitbridge"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe("hello gitbridge");
    });

    it("handles command with stdin input", async () => {
      const { execProcess } = await import("@/utils/proc");
      const res = await execProcess("cat", [], { stdin: "piped content" });
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe("piped content");
    });

    it("handles command failure with allowFailure=true", async () => {
      const { execProcess } = await import("@/utils/proc");
      const res = await execProcess("false", [], { allowFailure: true });
      expect(res.exitCode).not.toBe(0);
    });

    it("rejects command failure with allowFailure=false", async () => {
      const { execProcess } = await import("@/utils/proc");
      expect(execProcess("false", [])).rejects.toThrow();
    });

    it("rejects when binary does not exist", async () => {
      const { execProcess } = await import("@/utils/proc");
      expect(execProcess("non_existent_binary_xyz_123", [])).rejects.toThrow();
    });
  });

  describe("Logger", () => {
    it("logs across all severity levels without throwing", async () => {
      const { logger } = await import("@/utils/logger");
      expect(() => {
        logger.debug("test debug");
        logger.info("test info");
        logger.warn("test warn");
        logger.error("test error");
        logger.success("test success");
      }).not.toThrow();
    });
  });
});
