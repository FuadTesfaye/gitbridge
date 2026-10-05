import { describe, it, expect, afterEach } from "bun:test";
import { compareVersions, fetchLatestVersion, handleUpdateCommand, isValidVersion } from "@/cli/commands/update";

/** Registry responses are mocked: the suite never talks to registry.npmjs.org. */
function mockRegistry(handler: (url: string) => { status: number; body?: unknown }) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const { status, body } = handler(url);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("Update Command", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("compareVersions", () => {
    it("returns 1 when v1 is newer than v2", () => {
      expect(compareVersions("0.2.7", "0.2.6")).toBe(1);
      expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
      expect(compareVersions("0.3.0", "0.2.7")).toBe(1);
    });

    it("returns -1 when v1 is older than v2", () => {
      expect(compareVersions("0.2.6", "0.2.7")).toBe(-1);
      expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
    });

    it("returns 0 when versions are equal", () => {
      expect(compareVersions("0.2.7", "0.2.7")).toBe(0);
      expect(compareVersions("v0.2.7", "0.2.7")).toBe(0);
    });
  });

  describe("isValidVersion", () => {
    it("accepts plain semver and rejects anything that could smuggle arguments", () => {
      expect(isValidVersion("0.2.9")).toBe(true);
      expect(isValidVersion("1.0.0-beta.1")).toBe(true);
      expect(isValidVersion("0.2.9 --registry http://evil")).toBe(false);
      expect(isValidVersion("../../evil")).toBe(false);
      expect(isValidVersion("latest")).toBe(false);
      expect(isValidVersion(42)).toBe(false);
    });
  });

  describe("fetchLatestVersion", () => {
    it("returns the version the registry reports", async () => {
      mockRegistry(() => ({ status: 200, body: { version: "9.9.9" } }));
      expect(await fetchLatestVersion("@fuad24/gitbridge")).toBe("9.9.9");
    });

    it("returns null for non-existent packages", async () => {
      mockRegistry(() => ({ status: 404, body: { error: "Not found" } }));
      expect(await fetchLatestVersion("@fuad24/non-existent-package-xyz-12345")).toBeNull();
    });

    it("returns null when the registry answers with something that is not a version", async () => {
      mockRegistry(() => ({ status: 200, body: { version: "9.9.9 --registry http://evil" } }));
      expect(await fetchLatestVersion("@fuad24/gitbridge")).toBeNull();
    });

    it("refuses to query a cleartext registry", async () => {
      let called = false;
      mockRegistry(() => {
        called = true;
        return { status: 200, body: { version: "9.9.9" } };
      });
      expect(await fetchLatestVersion("@fuad24/gitbridge", "http://registry.example.com")).toBeNull();
      expect(called).toBe(false);
    });
  });

  describe("handleUpdateCommand --check", () => {
    function captureOutput() {
      let output = "";
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...args) => {
        output += args.join(" ") + "\n";
      };
      console.error = (...args) => {
        output += args.join(" ") + "\n";
      };
      return {
        get text() {
          return output;
        },
        restore() {
          console.log = originalLog;
          console.error = originalError;
        },
      };
    }

    it("runs check mode without error", async () => {
      mockRegistry(() => ({ status: 200, body: { version: "0.0.1" } }));
      const out = captureOutput();
      try {
        await handleUpdateCommand({ check: true });
        expect(out.text).toContain("GitBridge Update Checker");
        expect(out.text).toContain("up to date");
      } finally {
        out.restore();
      }
    });

    it("refuses a cleartext registry before contacting it", async () => {
      let called = false;
      mockRegistry(() => {
        called = true;
        return { status: 200, body: { version: "9.9.9" } };
      });
      const out = captureOutput();
      try {
        await handleUpdateCommand({ check: true, registry: "http://registry.example.com" });
        expect(out.text).toContain("Refusing to use a non-HTTPS registry");
        expect(called).toBe(false);
      } finally {
        out.restore();
      }
    });
  });
});
