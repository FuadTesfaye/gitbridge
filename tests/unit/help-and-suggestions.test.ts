import { describe, it, expect } from "bun:test";
import { formatRootHelp } from "@/cli/ui/help";
import { execProcess } from "@/utils/proc";
import path from "path";

const GB_BIN = path.resolve(__dirname, "../../bin/gb.ts");
const GITBRIDGE_BIN = path.resolve(__dirname, "../../bin/gitbridge.ts");

const runCmd = (cmd: string, args: string[]) => execProcess(cmd, args, { allowFailure: true });

describe("Enhanced CLI Help & Suggestions Integration", () => {
  describe("formatRootHelp", () => {
    it("includes all 25 user-facing commands across 5 categories", () => {
      const help = formatRootHelp("gb");

      // Category Headers
      expect(help).toContain("CORE WORKFLOWS");
      expect(help).toContain("IDENTITY & REPOSITORY MANAGEMENT");
      expect(help).toContain("PROVIDERS, ACCOUNTS & MULTI-REMOTE");
      expect(help).toContain("INTEGRATIONS & SYSTEM OVERRIDES");
      expect(help).toContain("SECURITY & DIAGNOSTICS");

      // Core Workflows
      expect(help).toContain("setup");
      expect(help).toContain("status");
      expect(help).toContain("context");
      expect(help).toContain("explain");
      expect(help).toContain("current");
      expect(help).toContain("switch");
      expect(help).toContain("clone");
      expect(help).toContain("init");
      expect(help).toContain("env");

      // Identity & Repositories
      expect(help).toContain("identity");
      expect(help).toContain("repo");
      expect(help).toContain("rule");
      expect(help).toContain("ssh");

      // Providers & Remotes
      expect(help).toContain("auth");
      expect(help).toContain("account");
      expect(help).toContain("provider");
      expect(help).toContain("remote");
      expect(help).toContain("push");

      // Integrations & Overrides
      expect(help).toContain("override");
      expect(help).toContain("ide");
      expect(help).toContain("enable");
      expect(help).toContain("disable");
      expect(help).toContain("completion");

      // Security & Diagnostics
      expect(help).toContain("security");
      expect(help).toContain("doctor");

      // Options
      expect(help).toContain("-V, --version");
      expect(help).toContain("-h, --help, -help");

      // Examples & Documentation
      expect(help).toContain("EXAMPLES");
      expect(help).toContain("gb clone <repo-url>");
      expect(help).toContain("https://github.com/FuadTesfaye/gitbridge");
    });
  });

  describe("Subprocess CLI -help Support", () => {
    it("runs 'gb -help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "-help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("GitBridge");
      expect(res.stdout).toContain("CORE WORKFLOWS");
      expect(res.stdout).toContain("clone");
      expect(res.stdout).toContain("ssh");
      expect(res.stdout).toContain("completion");
    });

    it("runs 'gb --help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "--help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("GitBridge");
    });

    it("runs 'gb help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("GitBridge");
    });

    it("runs 'gb -h' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "-h"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("GitBridge");
    });

    it("runs 'gitbridge -help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GITBRIDGE_BIN, "-help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("GitBridge");
      expect(res.stdout).toContain("gitbridge setup");
    });

    it("runs subcommand help 'gb auth -help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "auth", "-help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("login");
      expect(res.stdout).toContain("logout");
    });

    it("runs subcommand help 'gb repo -help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "repo", "-help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("set");
      expect(res.stdout).toContain("list");
      expect(res.stdout).toContain("unset");
    });

    it("runs subcommand help 'gb ssh -help' cleanly with exit code 0", async () => {
      const res = await runCmd("bun", [GB_BIN, "ssh", "-help"]);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain("generate");
      expect(res.stdout).toContain("link");
    });
  });

  describe("Subprocess CLI Typo Suggestions", () => {
    it("suggests 'status' when user types 'statsu'", async () => {
      const res = await runCmd("bun", [GB_BIN, "statsu"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown command: 'statsu'");
      expect(output).toContain("gb status (or 'gb st')");
    });

    it("suggests 'identity' (not 'ide') when user types 'ident'", async () => {
      const res = await runCmd("bun", [GB_BIN, "ident"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown command: 'ident'");
      expect(output).toContain("gb identity (or 'gb id')");
    });

    it("suggests 'auth login' when user types 'login' directly at root", async () => {
      const res = await runCmd("bun", [GB_BIN, "login"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown command: 'login'");
      expect(output).toContain("gb auth login");
    });

    it("suggests 'security check' when user types 'check' directly at root", async () => {
      const res = await runCmd("bun", [GB_BIN, "check"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown command: 'check'");
      expect(output).toContain("gb security check");
    });

    it("suggests 'ide sync' when user types 'sync' directly at root", async () => {
      const res = await runCmd("bun", [GB_BIN, "sync"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown command: 'sync'");
      expect(output).toContain("gb ide sync");
    });

    it("suggests 'list' when user types 'gb id lst'", async () => {
      const res = await runCmd("bun", [GB_BIN, "id", "lst"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown subcommand for 'gb id': 'lst'");
      expect(output).toContain("gb id list (or 'gb id ls')");
    });

    it("suggests 'set' when user types 'gb repo sett'", async () => {
      const res = await runCmd("bun", [GB_BIN, "repo", "sett"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown subcommand for 'gb repo': 'sett'");
      expect(output).toContain("gb repo set");
    });

    it("suggests 'security check' when user types 'gb security chek'", async () => {
      const res = await runCmd("bun", [GB_BIN, "security", "chek"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown subcommand for 'gb security': 'chek'");
      expect(output).toContain("gb security check");
    });

    it("suggests '--version' when user types option typo '--verison'", async () => {
      const res = await runCmd("bun", [GB_BIN, "--verison"]);
      expect(res.exitCode).toBe(1);
      const output = res.stdout + res.stderr;
      expect(output).toContain("✖️  Unknown option: '--verison'");
      expect(output).toContain("--version");
    });
  });
});
