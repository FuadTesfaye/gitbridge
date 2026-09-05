import { describe, it, expect } from "bun:test";
import { compareVersions, fetchLatestVersion, handleUpdateCommand } from "@/cli/commands/update";
import { GITBRIDGE_VERSION } from "@/version";

describe("Update Command", () => {
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

  describe("fetchLatestVersion", () => {
    it("fetches latest version from npm registry", async () => {
      const version = await fetchLatestVersion("@fuad24/gitbridge");
      expect(version).not.toBeNull();
      expect(typeof version).toBe("string");
    });

    it("returns null for non-existent packages", async () => {
      const version = await fetchLatestVersion("@fuad24/non-existent-package-xyz-12345");
      expect(version).toBeNull();
    });
  });

  describe("handleUpdateCommand --check", () => {
    it("runs check mode without error", async () => {
      let output = "";
      const originalLog = console.log;
      console.log = (...args) => {
        output += args.join(" ") + "\n";
      };

      try {
        await handleUpdateCommand({ check: true });
        expect(output).toContain("GitBridge Update Checker");
      } finally {
        console.log = originalLog;
      }
    });
  });
});
