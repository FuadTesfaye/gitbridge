import { describe, expect, it } from "bun:test";
import os from "node:os";
import { defaultPathResolver } from "@/core/config/path-resolver";

describe("Test sandbox (tests/setup/isolate-home.ts)", () => {
  it("never points the suite at the real home directory", () => {
    const sandboxHome = process.env.HOME;
    expect(sandboxHome).toBeDefined();
    expect(sandboxHome).toContain("gitbridge-test-home-");
    expect(sandboxHome).not.toBe(os.userInfo().homedir);

    expect(process.env.XDG_CONFIG_HOME?.startsWith(sandboxHome!)).toBe(true);
    expect(process.env.GITBRIDGE_HOME?.startsWith(sandboxHome!)).toBe(true);
  });

  it("makes the default resolver land inside the sandbox", () => {
    const sandboxHome = process.env.HOME!;
    expect(defaultPathResolver.getBaseDir().startsWith(sandboxHome)).toBe(true);
    expect(defaultPathResolver.getUserGitConfigFile().startsWith(sandboxHome)).toBe(true);
    expect(defaultPathResolver.getUserSshConfigFile().startsWith(sandboxHome)).toBe(true);
    expect(defaultPathResolver.getUserConfigDir().startsWith(sandboxHome)).toBe(true);
  });
});
