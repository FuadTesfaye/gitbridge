import { describe, it, expect } from "bun:test";
import {
  damerauLevenshtein,
  scoreSimilarity,
  findCommandSuggestions,
  detectParentCommand,
  handleTooManyArguments,
  formatCommandError,
  formatOptionError,
  normalizeArgv,
  COMMAND_REGISTRY,
} from "@/utils/similarity";

describe("Similarity & Command Suggestion Engine", () => {
  describe("damerauLevenshtein", () => {
    it("returns 0 for identical strings", () => {
      expect(damerauLevenshtein("status", "status")).toBe(0);
      expect(damerauLevenshtein("", "")).toBe(0);
    });

    it("handles single insertions and deletions", () => {
      expect(damerauLevenshtein("status", "statu")).toBe(1);
      expect(damerauLevenshtein("statu", "status")).toBe(1);
    });

    it("handles single character substitution", () => {
      expect(damerauLevenshtein("status", "statux")).toBe(1);
    });

    it("handles adjacent character transposition with cost 1", () => {
      expect(damerauLevenshtein("statsu", "status")).toBe(1);
      expect(damerauLevenshtein("swti", "swit")).toBe(1);
    });
  });

  describe("scoreSimilarity & Prefix Boosting", () => {
    it("scores exact matches as 1.0", () => {
      expect(scoreSimilarity("status", "status")).toBe(1.0);
    });

    it("boosts prefix matches so 'ident' strongly prefers 'identity' over 'ide'", () => {
      const identityScore = scoreSimilarity("ident", "identity");
      const ideScore = scoreSimilarity("ident", "ide");
      expect(identityScore).toBeGreaterThan(ideScore);
      expect(identityScore).toBeGreaterThan(0.9);
    });

    it("boosts prefix matches for common commands", () => {
      expect(scoreSimilarity("stat", "status")).toBeGreaterThan(0.9);
      expect(scoreSimilarity("prov", "provider")).toBeGreaterThan(0.9);
      expect(scoreSimilarity("secur", "security")).toBeGreaterThan(0.9);
      expect(scoreSimilarity("cur", "current")).toBeGreaterThan(0.9);
    });
  });

  describe("findCommandSuggestions", () => {
    it("suggests 'status' for typo 'statsu'", () => {
      const suggestions = findCommandSuggestions("statsu");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("status");
    });

    it("suggests 'identity' for prefix 'ident'", () => {
      const suggestions = findCommandSuggestions("ident");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("identity");
    });

    it("discovers parent command when subcommand is run at root level (e.g. login -> auth login)", () => {
      const suggestions = findCommandSuggestions("login");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fullCommand).toBe("auth login");
    });

    it("discovers parent command for 'check' -> 'security check'", () => {
      const suggestions = findCommandSuggestions("check");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fullCommand).toBe("security check");
    });

    it("discovers parent command for 'scan' -> 'security scan'", () => {
      const suggestions = findCommandSuggestions("scan");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fullCommand).toBe("security scan");
    });

    it("discovers parent command for 'gen' -> 'ssh generate'", () => {
      const suggestions = findCommandSuggestions("gen");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fullCommand).toBe("ssh generate");
    });

    it("discovers parent command for 'sync' -> 'ide sync'", () => {
      const suggestions = findCommandSuggestions("sync");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].fullCommand).toBe("ide sync");
    });

    it("suggests subcommands under a parent command (e.g. lst -> list under identity)", () => {
      const suggestions = findCommandSuggestions("lst", "identity");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("list");
    });

    it("suggests subcommands under an alias (e.g. lst under 'id')", () => {
      const suggestions = findCommandSuggestions("lst", "id");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("list");
    });

    it("suggests 'set' for typo 'sett' under repo", () => {
      const suggestions = findCommandSuggestions("sett", "repo");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("set");
    });

    it("suggests 'generate' for typo 'genrate' under ssh", () => {
      const suggestions = findCommandSuggestions("genrate", "ssh");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].command).toBe("generate");
    });
  });

  describe("detectParentCommand", () => {
    it("returns undefined for root commands", () => {
      expect(detectParentCommand(["bun", "gb.ts", "statsu"], "statsu")).toBeUndefined();
      expect(detectParentCommand(["node", "/path/to/gb", "ident"], "ident")).toBeUndefined();
    });

    it("identifies parent command for subcommands", () => {
      expect(detectParentCommand(["bun", "gb.ts", "id", "lst"], "lst")).toBe("id");
      expect(detectParentCommand(["bun", "gb.ts", "identity", "lst"], "lst")).toBe("identity");
      expect(detectParentCommand(["node", "gb", "repo", "sett"], "sett")).toBe("repo");
      expect(detectParentCommand(["node", "gb", "auth", "logn"], "logn")).toBe("auth");
    });

    it("ignores flags when detecting parent command", () => {
      expect(detectParentCommand(["bun", "gb.ts", "id", "--global", "lst"], "lst")).toBe("id");
    });
  });

  describe("handleTooManyArguments", () => {
    it("formats suggestion when unexpected argument is passed to command with default action", () => {
      const errStr = "error: too many arguments for 'security'. Expected 0 arguments but got 1.";
      const formatted = handleTooManyArguments(errStr, ["bun", "gb.ts", "security", "chek"], "gb");
      expect(formatted).not.toBeNull();
      expect(formatted).toContain("gb security check");
    });

    it("handles aliases like 'sec'", () => {
      const errStr = "error: too many arguments for 'security'. Expected 0 arguments but got 1.";
      const formatted = handleTooManyArguments(errStr, ["bun", "gb.ts", "sec", "chek"], "gb");
      expect(formatted).not.toBeNull();
      expect(formatted).toContain("gb security check");
    });

    it("returns null for commands without subcommands", () => {
      const errStr = "error: too many arguments for 'status'. Expected 0 arguments but got 1.";
      const formatted = handleTooManyArguments(errStr, ["bun", "gb.ts", "status", "foo"], "gb");
      expect(formatted).toBeNull();
    });
  });

  describe("formatCommandError & formatOptionError", () => {
    it("formats clean root error with suggested command and description", () => {
      const output = formatCommandError("statsu", "gb");
      expect(output).toContain("✖️  Unknown command: 'statsu'");
      expect(output).toContain("gb status (or 'gb st')");
      expect(output).toContain("Run gb --help to see all available commands.");
    });

    it("formats clean subcommand error with parent context", () => {
      const output = formatCommandError("lst", "gb", "id");
      expect(output).toContain("✖️  Unknown subcommand for 'gb id': 'lst'");
      expect(output).toContain("gb id list (or 'gb id ls')");
      expect(output).toContain("Run gb id --help to see all available subcommands.");
    });

    it("formats option suggestions for typos like --verison", () => {
      const output = formatOptionError("--verison", "gb");
      expect(output).toContain("✖️  Unknown option: '--verison'");
      expect(output).toContain("--version");
    });
  });

  describe("normalizeArgv", () => {
    it("converts -help to --help", () => {
      expect(normalizeArgv(["node", "gb", "-help"])).toEqual(["node", "gb", "--help"]);
      expect(normalizeArgv(["node", "gb", "auth", "-help"])).toEqual(["node", "gb", "auth", "--help"]);
      expect(normalizeArgv(["node", "gb", "identity", "add", "-help"])).toEqual([
        "node",
        "gb",
        "identity",
        "add",
        "--help",
      ]);
    });

    it("leaves other arguments untouched", () => {
      expect(normalizeArgv(["node", "gb", "status", "-v", "--json"])).toEqual([
        "node",
        "gb",
        "status",
        "-v",
        "--json",
      ]);
    });
  });

  describe("COMMAND_REGISTRY completeness", () => {
    it("contains all core commands", () => {
      const names = COMMAND_REGISTRY.map((c) => c.name);
      expect(names).toContain("setup");
      expect(names).toContain("status");
      expect(names).toContain("context");
      expect(names).toContain("explain");
      expect(names).toContain("current");
      expect(names).toContain("switch");
      expect(names).toContain("clone");
      expect(names).toContain("init");
      expect(names).toContain("env");
      expect(names).toContain("identity");
      expect(names).toContain("repo");
      expect(names).toContain("rule");
      expect(names).toContain("ssh");
      expect(names).toContain("auth");
      expect(names).toContain("account");
      expect(names).toContain("provider");
      expect(names).toContain("remote");
      expect(names).toContain("push");
      expect(names).toContain("override");
      expect(names).toContain("ide");
      expect(names).toContain("enable");
      expect(names).toContain("disable");
      expect(names).toContain("completion");
      expect(names).toContain("security");
      expect(names).toContain("doctor");
      expect(names).toContain("update");
    });
  });
});
